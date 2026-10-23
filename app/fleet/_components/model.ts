import type {FleetView} from "@/server/fleet/list";
import type {Wire} from "@/components/operator/format";
export type FleetRead=Wire<FleetView>&{schema_version:1};
export type ServerRow=FleetRead['hosts'][number];
export type GroupRow=FleetRead['groups'][number];
export type Target={id:string;revision:string};
export const targets=(rows:ServerRow[]):Target[]=>rows.map(r=>({id:r.host_id,revision:r.revision}));
export function validFleet(v:unknown):v is FleetRead{const r=v as FleetRead;return !!r&&r.schema_version===1&&typeof r.as_of==='string'&&Number.isFinite(Date.parse(r.as_of))&&Array.isArray(r.hosts)&&r.hosts.every(h=>typeof h.host_id==='string'&&typeof h.label==='string'&&typeof h.revision==='string'&&['active','paused','archived'].includes(h.lifecycle)&&['current','stale','unknown','revoked'].includes(h.contact_state)&&['healthy','warning','critical','unknown'].includes(h.health_state)&&typeof h.control_supported==='boolean'&&typeof h.control_applied==='boolean'&&(h.update===undefined||!!h.update&&typeof h.update.available==='boolean'&&(h.update.version===null||typeof h.update.version==='string')&&(h.update.reason===null||typeof h.update.reason==='string'))&&Array.isArray(h.groups)&&h.groups.every(g=>typeof g==='string')&&Array.isArray(h.tags)&&h.tags.every(tag=>typeof tag==='string'))&&Array.isArray(r.groups)&&!!r.counts&&typeof r.total==='number'&&(r.next_cursor===null||typeof r.next_cursor==='string');}
export const splitTags=(s:string)=>[...new Set(s.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean))];
