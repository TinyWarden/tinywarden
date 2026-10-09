import {sql,type Transaction,type RawBuilder} from "kysely";
import type {Database} from "../../db/types";
import type {MetricBucket} from "../../../lib/skills/metric-types";
export interface MetricScope {host:string;installation:string;digests:string[];metric:string;from:Date;to:Date;cutoff:Date;buckets:number;keys:string[]}
export function candidates(scope:MetricScope):RawBuilder<unknown>{
  return sql`SELECT f.* FROM tinywarden.skill_metric_frames f
    JOIN tinywarden.skill_observations o ON o.id=f.observation_id
    WHERE f.host_id=${scope.host}::uuid AND f.installation_id=${scope.installation}::uuid
      AND f.content_sha256=ANY(${scope.digests}::text[]) AND f.sampled_at>=${scope.from}::timestamptz
      AND f.sampled_at<${scope.to}::timestamptz AND o.received_at>=${scope.cutoff}::timestamptz
    ORDER BY f.sampled_at,f.observation_id LIMIT 150001`;
}
interface BucketRow {series_key:string;bucket:number;count:string;min:string|null;max:string|null;last:string|null;last_at:Date|null;incomplete:boolean;has_gap:boolean;connect_from_previous:boolean;error:boolean}
function canonical(value:string|null){return value===null?null:value.includes(".")?value.replace(/0+$/,"").replace(/\.$/,""):value;}
export async function metricBuckets(trx:Transaction<Database>,scope:MetricScope):Promise<Map<string,MetricBucket[]>>{
  const width=(scope.to.getTime()-scope.from.getTime())/scope.buckets;
  const rows=(await sql<BucketRow>`WITH frames AS MATERIALIZED (${candidates(scope)}), expanded AS (
    SELECT f.sampled_at,f.observation_id,o.run_sequence,o.evidence_expires_at,k.series_key,s.value,
      concat_ws(':',f.content_sha256,o.agent_id,o.generation,a.enablement_version,a.settings_revision,a.policy_version,coalesce(f.recovery_epoch::text,'none')) AS context,
      coalesce((f.flags->${scope.metric}->>'incomplete')::boolean,false) AS incomplete,
      f.flags->${scope.metric}->>'error' IS NOT NULL AS error
    FROM frames f JOIN tinywarden.skill_observations o ON o.id=f.observation_id
    JOIN tinywarden.skill_assignments a ON a.id=o.assignment_id
    CROSS JOIN unnest(${scope.keys}::text[]) k(series_key)
    LEFT JOIN tinywarden.skill_metric_samples s ON s.observation_id=f.observation_id
      AND s.metric_key=${scope.metric} AND s.series_key=k.series_key
  ), previous AS (
    SELECT *,lag(sampled_at) OVER w AS previous_at,lag(evidence_expires_at) OVER w AS previous_expiry,
      lag(value) OVER w AS previous_value,lag(context) OVER w AS previous_context,
      lag(incomplete) OVER w AS previous_incomplete
    FROM expanded WINDOW w AS (PARTITION BY series_key ORDER BY sampled_at,run_sequence,observation_id)
  ), grouped AS (
    SELECT *,floor(extract(epoch FROM (sampled_at-${scope.from}::timestamptz))*1000/${width})::integer AS bucket,
      previous_at IS NULL OR value IS NULL OR previous_value IS NULL OR incomplete OR coalesce(previous_incomplete,false)
        OR context IS DISTINCT FROM previous_context OR sampled_at>previous_expiry AS break_before,
      value IS NULL OR incomplete OR error OR (previous_at IS NOT NULL AND
        (previous_value IS NULL OR coalesce(previous_incomplete,false) OR context IS DISTINCT FROM previous_context OR sampled_at>previous_expiry)) AS gap
    FROM previous
  ) SELECT series_key,bucket,count(value)::text AS count,min(value)::text AS min,max(value)::text AS max,
      ((array_agg(value ORDER BY sampled_at DESC,run_sequence DESC,observation_id DESC) FILTER(WHERE value IS NOT NULL))[1])::text AS last,
      max(sampled_at) FILTER(WHERE value IS NOT NULL) AS last_at,
      bool_or(incomplete) AS incomplete,bool_or(gap) AS has_gap,
      NOT bool_or(break_before) AND count(value)>0 AS connect_from_previous,bool_or(error) AS error
    FROM grouped GROUP BY series_key,bucket ORDER BY series_key,bucket`.execute(trx)).rows;
  const byKey=new Map(scope.keys.map(key=>[key,Array.from({length:scope.buckets},(_,index):MetricBucket=>({
    start:new Date(scope.from.getTime()+width*index).toISOString(),end:new Date(scope.from.getTime()+width*(index+1)).toISOString(),
    count:0,min:null,max:null,last:null,last_at:null,incomplete:false,has_gap:true,connect_from_previous:false,reasons:["evidence"]
  }))]));
  for(const row of rows){const bucket=byKey.get(row.series_key)?.[row.bucket];if(!bucket)continue;
    Object.assign(bucket,{count:Number(row.count),min:canonical(row.min),max:canonical(row.max),last:canonical(row.last),last_at:row.last_at?.toISOString()??null,
      incomplete:row.incomplete,has_gap:row.has_gap,connect_from_previous:row.connect_from_previous,
      reasons:row.has_gap?[row.error?"extraction":row.incomplete?"coverage":"context"]:[]});}
  // Empty buckets also break the next bucket, even if two received points share context.
  for(const points of byKey.values())points.forEach((p,i)=>{if(i===0||!points[i-1]?.count||points[i-1]?.has_gap)p.connect_from_previous=false;});
  return byKey;
}
