import {sql,type Transaction} from "kysely";
import type {Database} from "../../db/types";
import {fail} from "../../errors";
import type {AdaptiveSeries,MetricGap,MetricGapReason,MetricPoint,MetricBucket} from "../../../lib/skills/metric-types";
import {candidates,type MetricScope} from "./buckets";
const canonical=(v:string|null)=>v===null?null:v.includes(".")?v.replace(/0+$/,"").replace(/\.$/,""):v;
const instant=(v:string)=>new Date(v).toISOString();
interface Row {key:string;first:string|null;retained_count:string;points:MetricPoint[];buckets:(MetricBucket&{frame_count:number})[];gaps:MetricGap[];readings:string;last:string|null;last_at:string|null}
export async function adaptiveSeries(trx:Transaction<Database>,scope:MetricScope,raw:boolean):Promise<AdaptiveSeries[]>{
  if(!scope.keys.length||scope.to<=scope.from)return [];
  const width=(scope.to.getTime()-scope.from.getTime())/scope.buckets;
  const rows=(await sql<Row>`WITH frames AS MATERIALIZED (${candidates(scope)}), retained AS MATERIALIZED (
    SELECT f.sampled_at,f.observation_id FROM tinywarden.skill_metric_frames f
    JOIN tinywarden.skill_observations o ON o.id=f.observation_id
    WHERE f.host_id=${scope.host}::uuid AND f.installation_id=${scope.installation}::uuid
      AND f.content_sha256=ANY(${scope.digests}::text[]) AND f.sampled_at>=${scope.cutoff}::timestamptz
      AND o.received_at>=${scope.cutoff}::timestamptz
    ORDER BY f.sampled_at,f.observation_id LIMIT 150001
  ), firsts AS (
    SELECT s.series_key,min(r.sampled_at) AS first FROM retained r
    JOIN tinywarden.skill_metric_samples s ON s.observation_id=r.observation_id
    WHERE s.metric_key=${scope.metric} AND s.series_key=ANY(${scope.keys}::text[]) GROUP BY s.series_key
  ), prior AS (
    SELECT k.key,f.* FROM unnest(${scope.keys}::text[]) k(key) CROSS JOIN LATERAL (
      SELECT f.* FROM tinywarden.skill_metric_frames f JOIN tinywarden.skill_observations o ON o.id=f.observation_id
      WHERE f.host_id=${scope.host}::uuid AND f.installation_id=${scope.installation}::uuid
        AND f.content_sha256=ANY(${scope.digests}::text[]) AND f.sampled_at<${scope.from}::timestamptz
        AND f.sampled_at>=${scope.cutoff}::timestamptz AND o.received_at>=${scope.cutoff}::timestamptz
      ORDER BY f.sampled_at DESC,o.run_sequence DESC,f.observation_id DESC LIMIT 1
    ) f
  ), expanded AS (
    SELECT k.key,f.*,true AS inside FROM frames f CROSS JOIN unnest(${scope.keys}::text[]) k(key)
    UNION ALL SELECT p.*,false AS inside FROM prior p
  ), evidence AS (
    SELECT f.key,f.sampled_at,f.observation_id,f.inside,o.run_sequence,o.evidence_expires_at,s.value,
      concat_ws(':',f.content_sha256,o.agent_id,o.generation,a.enablement_version,a.settings_revision,a.policy_version,coalesce(f.recovery_epoch::text,'none')) AS context,
      coalesce((f.flags->${scope.metric}->>'incomplete')::boolean,false) AS incomplete,
      f.flags->${scope.metric}->>'error' IS NOT NULL AS error
    FROM expanded f JOIN tinywarden.skill_observations o ON o.id=f.observation_id
    JOIN tinywarden.skill_assignments a ON a.id=o.assignment_id
    LEFT JOIN tinywarden.skill_metric_samples s ON s.observation_id=f.observation_id AND s.metric_key=${scope.metric} AND s.series_key=f.key
  ), previous AS (
    SELECT *,lag(sampled_at) OVER w AS prev_at,lag(evidence_expires_at) OVER w AS prev_expiry,
      lag(value) OVER w AS prev_value,lag(context) OVER w AS prev_context,
      lag(incomplete OR error) OVER w AS prev_invalid,lead(sampled_at) OVER w AS next_at
    FROM evidence WINDOW w AS (PARTITION BY key ORDER BY sampled_at,run_sequence,observation_id)
  ), classified AS (
    SELECT *,CASE WHEN error THEN 'extraction' WHEN incomplete THEN 'coverage' WHEN value IS NULL THEN 'evidence'
      WHEN prev_at IS NOT NULL AND context IS DISTINCT FROM prev_context THEN 'context'
      WHEN prev_at IS NOT NULL AND (prev_value IS NULL OR prev_invalid OR sampled_at>prev_expiry) THEN 'evidence' END AS reason,
      prev_at IS NOT NULL AND value IS NOT NULL AND prev_value IS NOT NULL AND NOT incomplete AND NOT error
        AND NOT coalesce(prev_invalid,false) AND context IS NOT DISTINCT FROM prev_context AND sampled_at<=prev_expiry AS connects
    FROM previous
  ), active AS (SELECT *,floor(extract(epoch FROM (sampled_at-${scope.from}::timestamptz))*1000/${width}::double precision)::integer AS bin FROM classified WHERE inside),
  totals AS (
    SELECT key,count(value)::text AS readings,
      (array_agg(value ORDER BY sampled_at DESC,run_sequence DESC,observation_id DESC) FILTER(WHERE value IS NOT NULL))[1]::text AS last,
      max(sampled_at) FILTER(WHERE value IS NOT NULL) AS last_at FROM active GROUP BY key
  ), raw_points AS (
    SELECT key,jsonb_agg(jsonb_build_object('at',sampled_at,'value',value::text,'valid_until',evidence_expires_at,
      'incomplete',incomplete,'connect_from_previous',connects,'reasons',CASE WHEN reason IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(reason) END)
      ORDER BY sampled_at,run_sequence,observation_id) AS points FROM active WHERE ${raw} GROUP BY key
  ), grouped AS (
    SELECT key,bin,count(*)::integer AS frame_count,count(value)::integer AS count,min(value)::text AS min,max(value)::text AS max,
      (array_agg(value ORDER BY sampled_at DESC,run_sequence DESC,observation_id DESC) FILTER(WHERE value IS NOT NULL))[1]::text AS last,
      max(sampled_at) FILTER(WHERE value IS NOT NULL) AS last_at,bool_or(incomplete) AS incomplete,
      bool_or(reason IS NOT NULL) AS has_gap,bool_and(connects) AS connects,
      array_agg(DISTINCT reason) FILTER(WHERE reason IS NOT NULL) AS reasons
    FROM active WHERE NOT ${raw} GROUP BY key,bin
  ), buckets AS (
    SELECT k.key,jsonb_agg(jsonb_build_object('start',${scope.from}::timestamptz + b.i*${width}::double precision*interval '1 millisecond',
      'end',${scope.from}::timestamptz+(b.i+1)*${width}::double precision*interval '1 millisecond','count',coalesce(g.count,0),'frame_count',coalesce(g.frame_count,0),
      'min',g.min,'max',g.max,'last',g.last,'last_at',g.last_at,'incomplete',coalesce(g.incomplete,false),
      'has_gap',coalesce(g.has_gap,false),'connect_from_previous',coalesce(g.connects,false),'reasons',coalesce(to_jsonb(g.reasons),'[]'::jsonb)) ORDER BY b.i) AS buckets
    FROM unnest(${scope.keys}::text[]) k(key) CROSS JOIN generate_series(0,${scope.buckets}-1) b(i)
    LEFT JOIN grouped g ON g.key=k.key AND g.bin=b.i WHERE NOT ${raw} GROUP BY k.key
  ), intervals AS (
    SELECT key,sampled_at AS a,coalesce(next_at,${scope.to}::timestamptz) AS z,
      CASE WHEN error THEN 'extraction' WHEN incomplete THEN 'coverage' ELSE 'evidence' END AS reason
      FROM classified WHERE (value IS NULL OR incomplete OR error)
    UNION ALL SELECT key,prev_expiry,sampled_at,'evidence' FROM active WHERE prev_at IS NOT NULL AND sampled_at>prev_expiry
    UNION ALL SELECT key,prev_at,sampled_at,'context' FROM active WHERE prev_at IS NOT NULL AND context IS DISTINCT FROM prev_context
    UNION ALL SELECT c.key,${scope.from}::timestamptz,c.sampled_at,
      CASE WHEN f.first>=${scope.from}::timestamptz THEN 'before_first_retained' ELSE 'evidence' END
      FROM active c LEFT JOIN firsts f ON f.series_key=c.key WHERE c.prev_at IS NULL
    UNION ALL SELECT key,evidence_expires_at,${scope.to}::timestamptz,'evidence' FROM classified WHERE next_at IS NULL AND value IS NOT NULL
    UNION ALL SELECT k.key,${scope.cutoff}::timestamptz,${scope.to}::timestamptz,'evidence'
      FROM unnest(${scope.keys}::text[]) k(key) WHERE NOT EXISTS(SELECT 1 FROM classified c WHERE c.key=k.key)
  ), clipped AS (
    SELECT key,greatest(a,${scope.from}::timestamptz) AS a,least(z,${scope.to}::timestamptz) AS z,reason FROM intervals
    WHERE a<${scope.to}::timestamptz AND z>${scope.from}::timestamptz AND z>a
  ), coarse AS (
    SELECT key,CASE WHEN ${raw} THEN a ELSE greatest(${scope.from}::timestamptz,${scope.from}::timestamptz+floor(extract(epoch FROM (a-${scope.from}::timestamptz))*1000/${width}::double precision)*${width}::double precision*interval '1 millisecond') END AS a,
      CASE WHEN ${raw} THEN z ELSE least(${scope.to}::timestamptz,${scope.from}::timestamptz+ceil(extract(epoch FROM (z-${scope.from}::timestamptz))*1000/${width}::double precision)*${width}::double precision*interval '1 millisecond') END AS z,reason FROM clipped
  ), ordered_gaps AS (
    SELECT *,max(z) OVER(PARTITION BY key ORDER BY a,z ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_end FROM coarse
  ), gap_groups AS (
    SELECT *,sum(CASE WHEN prev_end IS NULL OR a>prev_end THEN 1 ELSE 0 END) OVER(PARTITION BY key ORDER BY a,z) AS grp FROM ordered_gaps
  ), merged AS (
    SELECT key,min(a) AS a,max(z) AS z,CASE WHEN min(reason)=max(reason) THEN min(reason) ELSE 'unavailable' END AS reason FROM gap_groups GROUP BY key,grp
  ), gaps AS (
    SELECT key,jsonb_agg(jsonb_build_object('from',a,'to',z,'reason',reason,'coarse',NOT ${raw}) ORDER BY a) AS gaps FROM merged GROUP BY key
  ) SELECT k.key,f.first::text,(SELECT count(*)::text FROM retained) AS retained_count,
    coalesce(p.points,'[]'::jsonb) AS points,coalesce(b.buckets,'[]'::jsonb) AS buckets,coalesce(g.gaps,'[]'::jsonb) AS gaps,
    coalesce(t.readings,'0') AS readings,t.last,t.last_at::text
    FROM unnest(${scope.keys}::text[]) k(key) LEFT JOIN firsts f ON f.series_key=k.key
    LEFT JOIN raw_points p ON p.key=k.key LEFT JOIN buckets b ON b.key=k.key
    LEFT JOIN gaps g ON g.key=k.key LEFT JOIN totals t ON t.key=k.key`.execute(trx)).rows;
  if(rows.some(r=>Number(r.retained_count)>150000))fail("range_too_large",400);
  return rows.map(r=>({key:r.key,label:r.key,first_available:r.first?instant(r.first):null,
    summary:{readings:Number(r.readings),last:canonical(r.last),last_at:r.last_at?instant(r.last_at):null},
    gaps:r.gaps.map(g=>({...g,from:instant(g.from),to:instant(g.to),reason:g.reason as MetricGapReason})),
    ...(raw?{points:r.points.map(p=>({...p,at:instant(p.at),valid_until:instant(p.valid_until),value:canonical(p.value)}))}:
      {buckets:r.buckets.map(b=>({...b,start:instant(b.start),end:instant(b.end),last_at:b.last_at?instant(b.last_at):null,min:canonical(b.min),max:canonical(b.max),last:canonical(b.last)}))})}));
}
