import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/types';
export function outsideMaintenance(hostColumn:string,at:Date){
 const host=sql.ref(hostColumn);
 return sql<boolean>`NOT EXISTS(SELECT 1 FROM tinywarden.fleet_maintenance fm WHERE fm.host_id=${host}
   AND fm.starts_at<=${at} AND (fm.ends_at IS NULL OR fm.ends_at>${at}) AND (fm.closed_at IS NULL OR fm.closed_at>${at}))`;
}
export async function maintenanceBoundary(trx:Transaction<Database>,host:string,at:Date){
 const result=await sql<{active:boolean;boundary:Date|null}>`SELECT
  COALESCE(bool_or(starts_at<=${at} AND (ends_at IS NULL OR ends_at>${at}) AND (closed_at IS NULL OR closed_at>${at})),false) active,
  max(CASE WHEN ending>starts_at AND ending<=${at} THEN ending END) boundary
  FROM(SELECT *,CASE WHEN closed_at IS NOT NULL AND (ends_at IS NULL OR closed_at<ends_at) THEN closed_at ELSE ends_at END ending
    FROM tinywarden.fleet_maintenance WHERE host_id=${host}::uuid AND starts_at<=${at}) windows`.execute(trx);
 return result.rows[0]!;
}
