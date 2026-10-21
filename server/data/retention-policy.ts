import type { Transaction, Kysely, Selectable } from 'kysely';
import type { Database } from '../db/types';
import type { FleetTables } from '../db/fleet-types';
export const retentionDays=90;
export const retentionBatchSize=100;
export const retentionBatchLimit=10;
export const retentionBudgetMs=30_000;
type Policy=Selectable<FleetTables['data_retention_policy']>;
const policies=new WeakMap<Transaction<Database>,Promise<Policy>>();
export function retentionCutoff(at:Date,policy:Pick<Policy,'days'|'expired_before'>={days:90,expired_before:new Date('0001-01-01T00:00:00Z')}){
 if(!Number.isFinite(+at))throw new Error('invalid_retention_clock');
 return new Date(Math.max(+at-policy.days*86400000,+policy.expired_before));
}
export async function retentionPolicy(trx:Transaction<Database>,at:Date){
 let pending=policies.get(trx);
 if(!pending){pending=trx.selectFrom('data_retention_policy').selectAll().where('singleton','=',true).executeTakeFirstOrThrow();policies.set(trx,pending);}
 const policy=await pending;return {...policy,cutoff:retentionCutoff(at,policy)};
}
/** A cleanup pass publishes its irreversible boundary before deleting detail. */
export async function beginRetentionPass(db:Kysely<Database>,at:Date){
 return db.transaction().execute(async trx=>{
  const p=await trx.selectFrom('data_retention_policy').selectAll().where('singleton','=',true).forUpdate().executeTakeFirstOrThrow();
  const cutoff=retentionCutoff(at,p);
  if(cutoff>p.expired_before)await trx.updateTable('data_retention_policy').set({expired_before:cutoff}).where('singleton','=',true).execute();
  return {...p,cutoff};
 });
}
/** Acquire before collection roots/host locks when deriving new retained facts. */
export async function lockRetentionPolicy(trx:Transaction<Database>){
 return trx.selectFrom('data_retention_policy').select('revision').where('singleton','=',true).forShare().executeTakeFirstOrThrow();
}
export async function lockRetentionRevision(trx:Transaction<Database>,revision:string){
 const p=await lockRetentionPolicy(trx);
 return p.revision===revision;
}

export async function guardRetentionPass(trx:Transaction<Database>,revision?:string){
 if(revision&&!await lockRetentionRevision(trx,revision))throw new Error('retention_policy_changed');
}
