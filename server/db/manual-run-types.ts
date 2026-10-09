import type {ColumnType} from "kysely";
type Instant=ColumnType<Date,Date|string,Date|string>;
type Counter=ColumnType<string,string|number,string|number>;
export interface SkillManualRuns{
  id:string;operator_id:string;host_id:string;agent_id:string;generation:Counter;installation_id:string;
  content_sha256:string;enablement_version:Counter;settings_revision:Counter;policy_version:Counter;
  requested_at:Instant;queue_expires_at:Instant;phase:"queued"|"running"|"completed"|"failed";
  started_at:Instant|null;run_deadline:Instant|null;result_deadline:Instant|null;completed_at:Instant|null;reason:string|null;
  assignment_id:string|null;run_id:string|null;run_sequence:Counter|null;
}
