import type {Scalar} from "./package-types";
import type {ScalarSource,DisplayStatus} from "./display-types";
export type DashboardColumnRef={kind:"server";field:"os"|"agent_version"}|{kind:"skill";skill_id:string;field_id:string};
export interface DashboardLayout {format:1;sections:[{id:"servers";type:"server_table";columns:DashboardColumnRef[]},{id:"changes";type:"change_feed";visible:boolean}]}
export interface DashboardColumn {ref:DashboardColumnRef;label:string;skill_name:string|null;available:boolean}
export interface DashboardCatalog {skills:{id:string;name:string;enabled:boolean;fields:DashboardColumn[]}[];server:DashboardColumn[]}
export interface DashboardCell {state:string;value:Scalar|null;source:ScalarSource|null;context:string|null;truncated:boolean;measured_at:string|null;valid_until:string|null;
  meter:{min:number;max:number;thresholds:{value:number;severity:"warning"|"critical"}[];status:DisplayStatus}|null}
export interface DashboardLayoutView {schema_version:1;as_of:string;revision:string;layout:DashboardLayout;catalog:DashboardCatalog;columns:DashboardColumn[]}
export const defaultDashboardLayout=():DashboardLayout=>({format:1,sections:[{id:"servers",type:"server_table",columns:[]},{id:"changes",type:"change_feed",visible:true}]});
export function columnKey(ref:DashboardColumnRef){return ref.kind==="server"?`server:${ref.field}`:`skill:${ref.skill_id}:${ref.field_id}`;}
export function compareSkillNames(a:string,b:string){return new Intl.Collator("en",{sensitivity:"variant"}).compare(a,b);}
