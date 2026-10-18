import type {ColumnType} from "kysely";
import type {ResourceItem} from "../../lib/skills/resource-types";
import type {PackageReason} from "../../lib/skills/package-types";
type Instant=ColumnType<Date,Date|string,Date|string>;
type Counter=ColumnType<string,string|number,string|number>;
type OptionalText=ColumnType<string|null,string|null|undefined,string|null>;
export interface ResourceIdentityColumns {resource_collection:OptionalText;resource_key:OptionalText;resource_epoch:OptionalText;evaluation_revision:OptionalText}
export interface ResourceScope {resource_collection?:string|null;resource_key?:string|null;resource_epoch?:string|null;evaluation_revision?:string|null}
export interface ResourceInventoryRow {
 host_id:string;installation_id:string;collection:string;snapshot_id:string;observation_id:string;agent_id:string;generation:Counter;
 content_sha256:string;run_sequence:Counter;captured_at:Instant;received_at:Instant;complete:boolean;reason:PackageReason|null;items:ResourceItem[];
}
export interface ResourceMembership {id:string;host_id:string;installation_id:string;collection:string;resource_key:string;label:string;created_at:Instant;retired_at:Instant|null}
export interface ResourceScan {consumer:'history'|'notifications';scope:string;host_id:string;after_member:string|null;updated_at:Instant}
export interface ResourceTables {skill_resource_inventories:ResourceInventoryRow;skill_resource_memberships:ResourceMembership;skill_resource_scans:ResourceScan}
