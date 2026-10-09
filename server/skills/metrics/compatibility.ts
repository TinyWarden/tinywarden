import {sql,type Transaction} from "kysely";
import type {Database} from "../../db/types";
import type {DisplayMetric,DisplaySource,SkillDisplay} from "../../../lib/skills/display-types";
import {unitOf} from "../../../lib/skills/display-values";
import {fail} from "../../errors";

/** Stored samples are already numeric. Labels, encoding and widget layout do not
 * change their meaning; the value binding, unit and series identity do. */
export function metricShape(sources:Record<string,DisplaySource>,definition:DisplayMetric|undefined):string|null{
  if(!definition)return null;
  const source=sources[definition.value.fact],column=definition.value.column;
  if(!source||(source.kind==="table")!==!!column)return null;
  const scalar=source.kind==="table"?source.columns[column!]:source;
  if(!scalar||!(["number","percent","duration"].includes(scalar.kind)||scalar.kind==="text"&&scalar.encoding))return null;
  if(source.kind==="table"&&source.columns[definition.series_key!]?.kind!=="text")return null;
  return JSON.stringify([definition.value.fact,column??null,unitOf(scalar),source.kind==="table"?definition.series_key:null]);
}

export async function compatibleVersions(trx:Transaction<Database>,host:string,installation:string,skill:string,
  target:{digest:string;version:string;display:SkillDisplay},metric:string,cutoff:Date){
  const shape=metricShape(target.display.sources,target.display.metrics?.[metric]);
  if(!shape)fail("metric_unavailable",404);
  const versions=(await sql<{digest:string;version:string;sources:Record<string,DisplaySource>;definition:DisplayMetric|undefined}>`
    SELECT p.content_sha256 AS digest,p.version,p.metadata->'display'->'sources' AS sources,
      p.metadata->'display'->'metrics'->${metric} AS definition
    FROM tinywarden.skill_packages p WHERE p.skill_id=${skill} AND EXISTS (
      SELECT 1 FROM tinywarden.skill_metric_frames f JOIN tinywarden.skill_observations o ON o.id=f.observation_id
      WHERE f.host_id=${host}::uuid AND f.installation_id=${installation}::uuid AND f.content_sha256=p.content_sha256
        AND f.sampled_at>=${cutoff}::timestamptz AND o.received_at>=${cutoff}::timestamptz)
    ORDER BY p.content_sha256 LIMIT 129`.execute(trx)).rows;
  if(versions.length>128)fail("range_too_large",400);
  return [{digest:target.digest,version:target.version},...versions
    .filter(p=>p.digest!==target.digest&&metricShape(p.sources??{},p.definition)===shape)
    .map(({digest,version})=>({digest,version}))];
}
