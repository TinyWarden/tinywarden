import type {ColumnType} from "kysely";
import type {PlatformObservation} from "../../lib/agent-updates";
import type {ReleaseManifest} from "../agent-updates/release";
type Instant=ColumnType<Date,Date|string,Date|string>;
type NullableInstant=ColumnType<Date|null,Date|string|null,Date|string|null>;
type Counter=ColumnType<string,string|number,string|number>;
export interface AgentUpdateTables {
  agent_update_requests:{id:string;operation_id:string;host_id:string;agent_id:string;generation:Counter;
    target_version:string;manifest:string;signature:string;state:"queued"|"installing"|"confirming"|"succeeded"|"failed";
    error:string|null;created_at:Instant;expires_at:Instant;started_at:NullableInstant;updated_at:Instant;completed_at:NullableInstant};
  agent_release_catalog:{version:string;manifest:string;signature:string;metadata:ColumnType<ReleaseManifest,ReleaseManifest,ReleaseManifest>;verified_at:Instant};
  agent_release_catalog_state:{singleton:boolean;checked_at:NullableInstant;verified_at:NullableInstant;etag:string|null;tags:ColumnType<string[],string[],string[]>;error:string|null};
  agent_update_defaults:{singleton:boolean;automatic:boolean;revision:Counter;updated_at:Instant;last_request_id:string|null;last_fingerprint:Buffer|null};
  host_agent_update_policies:{host_id:string;automatic:boolean|null;revision:Counter;updated_at:Instant;last_request_id:string;last_fingerprint:Buffer};
  agent_platform_reports:{agent_id:string;generation:Counter;sequence:Counter;observed_at:Instant;received_at:Instant;observation:ColumnType<PlatformObservation,PlatformObservation,PlatformObservation>};
}
