import type {ColumnType} from 'kysely';
import type {ActionOrigin,ActionOriginPermission,ActionReadinessRow} from '../../lib/skills/action-types';
type Instant=ColumnType<Date,Date|string,Date|string>;
type Counter=ColumnType<string,string|number,string|number>;
export interface SkillActionTables{
 skill_action_grants:{id:string;installation_id:string;content_sha256:string;action_id:string;
  descriptor_sha256:string;action_version:number;origin:ActionOrigin;revision:Counter;enabled:boolean;
  operator_id:string;created_at:Instant;updated_at:Instant};
 agent_action_workers:{agent_id:string;generation:Counter;worker_ready:boolean;
  origins:ActionOriginPermission[];reported_at:Instant;cutover_at:Instant};
 agent_action_readiness:{agent_id:string;generation:Counter;grant_id:string;
  report:ActionReadinessRow;reported_at:Instant};
 skill_action_mutations:{operator_id:string;request_id:string;fingerprint:Buffer;result:unknown;completed_at:Instant};
}
