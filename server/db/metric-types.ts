import type {ColumnType} from "kysely";
type Instant=ColumnType<Date,Date|string,Date|string>;
export interface MetricFlag {error?:string;incomplete?:boolean;missing?:string[]}
export interface SkillMetricTables {
  skill_metric_frames:{observation_id:string;host_id:string;installation_id:string;content_sha256:string;sampled_at:Instant;recovery_epoch:string|null;format:number;flags:Record<string,MetricFlag>};
  skill_metric_samples:{observation_id:string;metric_key:string;series_key:string;label:string;value:string};
}
