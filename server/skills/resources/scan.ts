import {sql,type Transaction,type Selectable} from 'kysely';
import type {Database} from '../../db/types';
import type {ResourceMembership} from '../../db/resource-types';
export interface ResourceScanScope {consumer:'history'|'notifications';scope:string;host:string;at:Date}
export const resourcePageSize=128;
export async function resourceMembers(trx:Transaction<Database>,hosts:string[],installations:string[],scan?:ResourceScanScope){
 const old=scan?await trx.selectFrom('skill_resource_scans').selectAll().where('consumer','=',scan.consumer).where('scope','=',scan.scope).where('host_id','=',scan.host).forUpdate().executeTakeFirst():undefined;
 const read=(after:string|null,limit:number,before:string|null=null)=>sql<Selectable<ResourceMembership>>`SELECT m.* FROM tinywarden.skill_resource_memberships m
  WHERE m.host_id IN (${sql.join(hosts)}) AND m.installation_id IN (${sql.join(installations)}) AND
  (m.retired_at IS NULL OR EXISTS(SELECT 1 FROM tinywarden.notification_cursors c WHERE c.resource_epoch=m.id AND c.current)
   OR EXISTS(SELECT 1 FROM tinywarden.history_subjects h WHERE h.resource_epoch=m.id AND h.state<>'disabled'))
  ${after?sql`AND m.id>${after}::uuid`:sql``}
  ${before?sql`AND m.id<=${before}::uuid`:sql``}
  ORDER BY ${scan?sql`m.id`:sql`m.retired_at NULLS FIRST,m.id`} LIMIT ${limit}`.execute(trx);
 const rows=(await read(old?.after_member??null,scan?resourcePageSize:6500)).rows;
 // Fill the end of a pass from its beginning. Small selections are sampled on
 // every visit even when a newly added UUID sorts after the previous cursor.
 if(scan&&rows.length<resourcePageSize&&old?.after_member)rows.push(...(await read(null,resourcePageSize-rows.length,old.after_member)).rows);
 if(scan)await trx.insertInto('skill_resource_scans').values({consumer:scan.consumer,scope:scan.scope,host_id:scan.host,after_member:rows.at(-1)?.id??null,updated_at:scan.at})
  .onConflict(oc=>oc.columns(['consumer','scope','host_id']).doUpdateSet({after_member:rows.at(-1)?.id??null,updated_at:scan.at})).execute();
 return rows;
}
