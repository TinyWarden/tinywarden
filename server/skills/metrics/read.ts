import {sql,type Transaction} from "kysely";
import type {Database} from "../../db/types";
import {authorize,completeAuthorization} from "../../access/session";
import {uuid} from "../../validation";
import {fail,isPgError} from "../../errors";
import {packageRead,type PackageDb} from "../catalog/package-commands";
import {packageText} from "../../../lib/skills/package-types";
import {unitOf} from "../../../lib/skills/display-values";
import type {MetricHistory,AdaptiveHistory} from "../../../lib/skills/metric-types";
import type {MetricRequest} from "./request";
import {candidates,metricBuckets,type MetricScope} from "./buckets";
import {adaptiveSeries} from "./adaptive";
import {compatibleVersions} from "./compatibility";
async function directory(trx:Transaction<Database>,scope:MetricScope,selected:string[]){
  return (await sql<{key:string;label:string}>`WITH frames AS MATERIALIZED (${candidates(scope)})
    SELECT DISTINCT ON (s.series_key) s.series_key AS key,s.label
    FROM frames f JOIN tinywarden.skill_metric_samples s ON s.observation_id=f.observation_id
    WHERE s.metric_key=${scope.metric} AND (${selected.length===0} OR s.series_key=ANY(${selected}::text[]))
    ORDER BY s.series_key,f.sampled_at DESC,f.observation_id DESC LIMIT 33`.execute(trx)).rows;
}
export function readMetricHistory(db:PackageDb,cookie:string,rawHost:string,rawInstallation:string,metric:string,request:MetricRequest & {view:"adaptive"},clock:()=>Date):Promise<AdaptiveHistory>;
export function readMetricHistory(db:PackageDb,cookie:string,rawHost:string,rawInstallation:string,metric:string,request:MetricRequest & {view?:undefined},clock:()=>Date):Promise<MetricHistory>;
export function readMetricHistory(db:PackageDb,cookie:string,rawHost:string,rawInstallation:string,metric:string,request:MetricRequest,clock:()=>Date):Promise<MetricHistory|AdaptiveHistory>;
export async function readMetricHistory(db:PackageDb,cookie:string,rawHost:string,rawInstallation:string,metric:string,request:MetricRequest,clock:()=>Date):Promise<MetricHistory|AdaptiveHistory>{
  const host=uuid(rawHost),installation=uuid(rawInstallation);
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(metric))fail("invalid_request",400);
  try{return await packageRead(db,async trx=>{
    await sql`SET LOCAL statement_timeout='2s'`.execute(trx);
    const actor=await authorize(trx,cookie,clock);
    if(request.to>actor.at)fail("invalid_request",400);
    if(!await trx.selectFrom("hosts").select("id").where("id","=",host).executeTakeFirst())fail("not_found",404);
    const installed=await trx.selectFrom("skill_installations").selectAll().where("id","=",installation).executeTakeFirst();
    if(!installed)fail("not_found",404);
    const digest=request.digest??installed.content_sha256;
    const artifact=await trx.selectFrom("skill_packages").select("metadata").where("content_sha256","=",digest).where("skill_id","=",installed.skill_id).executeTakeFirst();
    const descriptor=artifact?.metadata.display,definition=descriptor?.metrics?.[metric];
    if(!artifact||!descriptor||!definition)fail("metric_unavailable",404);
    const source=descriptor.sources[definition.value.fact];
    if(!source)fail("metric_unavailable",404);
    const scalar=source.kind==="table"?source.columns[definition.value.column!]:source;
    if(!scalar)fail("metric_unavailable",404);
    const cutoff=new Date(actor.at.getTime()-90*86400000),to=request.to,from=new Date(Math.min(to.getTime(),Math.max(request.from.getTime(),cutoff.getTime())));
    const versions=await compatibleVersions(trx,host,installation,installed.skill_id,
      {digest,version:artifact.metadata.manifest.version,display:descriptor},metric,cutoff);
    const scope:MetricScope={host,installation,digests:versions.map(v=>v.digest),metric,from,to,cutoff,buckets:request.buckets,keys:request.series};
    let choices:{key:string;label:string}[]=[],data=new Map(),frameCount=0;
    if(to>from){
      const count=(await sql<{count:string}>`WITH frames AS MATERIALIZED (${candidates(scope)}) SELECT count(*)::text AS count FROM frames`.execute(trx)).rows[0]!;
      frameCount=Number(count.count);
      if(frameCount>150000)fail("range_too_large",400);
      choices=await directory(trx,scope,request.series);
      if(choices.length>32)fail("range_too_large",400);
      scope.keys=request.series.length?request.series:choices.length===1?[choices[0]!.key]:[];
      if(scope.keys.length&&!request.view)data=await metricBuckets(trx,scope);
    }
    if(request.view==="adaptive"){
      const raw=frameCount*scope.keys.length<=480;
      const series=await adaptiveSeries(trx,scope,raw);
      for(const item of series){
        item.label=choices.find(c=>c.key===item.key)?.label??item.key;
        if(request.from<from)item.gaps.unshift({from:request.from.toISOString(),to:from.toISOString(),reason:"retention",coarse:false});
      }
      await completeAuthorization(trx,actor,clock());
      const result:AdaptiveHistory={format:2,representation:raw?"samples":"buckets",host,installation,digest,metric,versions,
        title:packageText(artifact.metadata.catalog,{key:definition.title_key,params:{}}),unit:unitOf(scalar),
        requested:{from:request.from.toISOString(),to:to.toISOString()},applied:{from:from.toISOString(),to:to.toISOString()},
        as_of:actor.at.toISOString(),retained_cutoff:cutoff.toISOString(),first_available:series.map(s=>s.first_available).filter((s):s is string=>s!==null).sort()[0]??null,
        directory:choices,selection_required:!scope.keys.length&&choices.length>1,series};
      if(Buffer.byteLength(JSON.stringify(result))>512*1024)fail("range_too_large",400);
      return result;
    }
    const first=(await sql<{first:Date|null}>`SELECT min(f.sampled_at) AS first FROM (
      SELECT sampled_at,observation_id FROM tinywarden.skill_metric_frames WHERE host_id=${host}::uuid
      AND installation_id=${installation}::uuid AND content_sha256=ANY(${scope.digests}::text[]) AND sampled_at>=${cutoff}::timestamptz
      ORDER BY sampled_at,observation_id LIMIT 150001) f
      JOIN tinywarden.skill_observations o ON o.id=f.observation_id
      WHERE o.received_at>=${cutoff}::timestamptz AND EXISTS(SELECT 1 FROM tinywarden.skill_metric_samples s
        WHERE s.observation_id=f.observation_id AND s.metric_key=${metric})`.execute(trx)).rows[0]?.first;
    await completeAuthorization(trx,actor,clock());
    const result:MetricHistory={format:1,host,installation,digest,metric,versions,title:packageText(artifact.metadata.catalog,{key:definition.title_key,params:{}}),unit:unitOf(scalar),
      requested:{from:request.from.toISOString(),to:to.toISOString()},applied:{from:from.toISOString(),to:to.toISOString()},as_of:actor.at.toISOString(),retained_cutoff:cutoff.toISOString(),
      first_available:first?.toISOString()??null,directory:choices,selection_required:!scope.keys.length&&choices.length>1,
      series:scope.keys.map(key=>({key,label:choices.find(c=>c.key===key)?.label??key,buckets:data.get(key)??[]}))};
    if(Buffer.byteLength(JSON.stringify(result))>512*1024)fail("range_too_large",400);
    return result;
  });}catch(error){if(isPgError(error,"57014"))fail("range_too_large",400);throw error;}
}
