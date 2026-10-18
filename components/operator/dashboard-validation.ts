import type {DashboardLayout,DashboardColumnRef,DashboardColumn,DashboardLayoutView,DashboardCell} from "@/lib/skills/dashboard-types";
import {columnKey} from "@/lib/skills/dashboard-types";
import {isPackageSkillId} from "@/lib/skills/package-types";
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const count=(v:unknown)=>typeof v==="string"&&/^(0|[1-9][0-9]{0,15})$/.test(v)&&Number.isSafeInteger(Number(v));
function ref(v:unknown):v is DashboardColumnRef{return object(v)&&(v.kind==="server"&&(v.field==="os"||v.field==="agent_version")||v.kind==="skill_status"&&isPackageSkillId(v.skill_id)||v.kind==="skill"&&isPackageSkillId(v.skill_id)&&typeof v.field_id==="string"&&/^[a-z][a-z0-9_]{0,63}$/.test(v.field_id));}
export function validLayout(v:unknown):v is DashboardLayout{if(!object(v)||v.format!==1||!Array.isArray(v.sections)||v.sections.length!==2)return false;
  const [table,changes]=v.sections;return object(table)&&table.id==="servers"&&table.type==="server_table"&&Array.isArray(table.columns)&&table.columns.length<=32&&table.columns.every(ref)&&new Set(table.columns.map(columnKey)).size===table.columns.length&&object(changes)&&changes.id==="changes"&&changes.type==="change_feed"&&typeof changes.visible==="boolean";}
function column(v:unknown):v is DashboardColumn{return object(v)&&ref(v.ref)&&typeof v.label==="string"&&(v.skill_name===null||typeof v.skill_name==="string")&&typeof v.available==="boolean";}
export function validColumns(v:unknown):v is DashboardColumn[]{return Array.isArray(v)&&v.length<=32&&v.every(column)&&new Set(v.map(c=>columnKey(c.ref))).size===v.length;}
export function validLayoutRead(v:unknown):v is DashboardLayoutView{if(!object(v)||v.schema_version!==1||typeof v.as_of!=="string"||!Number.isFinite(Date.parse(v.as_of))||!count(v.revision)||!validLayout(v.layout)||!validColumns(v.columns)||!object(v.catalog))return false;
  return Array.isArray(v.catalog.server)&&v.catalog.server.length===2&&v.catalog.server.every(column)&&Array.isArray(v.catalog.skills)&&v.catalog.skills.length<=100&&v.catalog.skills.every(s=>object(s)&&isPackageSkillId(s.id)&&typeof s.name==="string"&&typeof s.enabled==="boolean"&&Array.isArray(s.fields)&&s.fields.length<=9&&s.fields.every(column));}
export function validCells(v:unknown):v is Record<string,DashboardCell>{
  return object(v)&&Object.keys(v).length<=32&&Object.values(v).every(c=>{
    if(!object(c)||typeof c.state!=="string"||typeof c.truncated!=="boolean")return false;
    if(c.value!==null&&!["string","number","boolean"].includes(typeof c.value))return false;
    if(c.source!==null&&(!object(c.source)||!["text","number","percent","boolean","time","duration"].includes(String(c.source.kind))))return false;
    if(c.context!==null&&typeof c.context!=="string"||c.measured_at!==null&&typeof c.measured_at!=="string"||c.valid_until!==null&&typeof c.valid_until!=="string")return false;
    const m=c.meter;if(m===null)return true;
    return object(m)&&Number.isFinite(m.min)&&Number.isFinite(m.max)&&typeof m.status==="string"&&Array.isArray(m.thresholds)&&m.thresholds.length<=2&&m.thresholds.every(t=>object(t)&&Number.isFinite(t.value)&&(t.severity==="warning"||t.severity==="critical"));
  });
}
