import type { ColumnType, Generated } from "kysely";
export type Lifecycle = "active" | "paused" | "archived" | "deleting";
type Instant = ColumnType<Date, Date|string, Date|string>;
type Counter = ColumnType<string, string|number, string|number>;
type DefaultCounter = ColumnType<string,string|number|undefined,string|number>;
export interface FleetHostColumns {
  lifecycle: Generated<Lifecycle>; fleet_revision: DefaultCounter; monitoring_epoch: DefaultCounter;
  monitoring_changed_at: ColumnType<Date|null,Date|string|null|undefined,Date|string|null>; description: Generated<string>; owner_notes: Generated<string>;
}
export interface FleetGroup {id:string;name:string;description:Generated<string>;revision:DefaultCounter;created_at:Instant}
export interface FleetTables {
  fleet_groups:FleetGroup;
  fleet_group_hosts:{group_id:string;host_id:string};
  fleet_host_tags:{host_id:string;tag:string};
  fleet_agent_control:{agent_id:string;generation:Counter;reported_at:Instant;applied_epoch:Counter|null;applied_at:Instant|null};
  fleet_maintenance:{id:string;host_id:string;starts_at:Instant;ends_at:Instant|null;closed_at:Instant|null;revision:DefaultCounter;created_at:Instant};
  fleet_operations:{id:string;operator_id:string;fingerprint:Buffer;kind:string;payload:Record<string,unknown>;removal_policy_revision:ColumnType<string|null,string|number|null|undefined,string|number|null>;created_at:Instant};
  fleet_operation_items:{operation_id:string;host_id:string;expected_revision:Counter;state:Generated<'pending'|'completed'|'conflict'|'failed'|'not_applicable'>;outcome:string|null;revision:Counter|null;completed_at:Instant|null};
  fleet_audit:{id:string;occurred_at:Instant;operator_id:string|null;host_id:string|null;operation_id:string|null;action:string;facts:Record<string,unknown>};
  data_retention_policy:{singleton:boolean;days:Generated<number>;revision:DefaultCounter;expired_before:ColumnType<Date,Date|string|undefined,Date|string>};
  fleet_purge_jobs:{host_id:string;operation_id:string;state:Generated<'pending'|'running'|'failed'|'completed'>;stage:Generated<number>;deleted_rows:DefaultCounter;created_at:Instant;updated_at:Instant;error:string|null};
}
