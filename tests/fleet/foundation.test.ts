import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { sql } from 'kysely';
import { createDb } from '../../server/db/client';
import { assertDatabaseTarget } from '../../server/db/target';
import { requireCurrentLedger } from '../../server/db/ledger';
import { down } from '../../server/db/migrations/031_fleet_management';

const url=process.env.TW_TEST_DATABASE_URL;
if(url && new URL(url).pathname!='/tinywarden_test_p1b')throw new Error('wrong_test_database');
describe.skipIf(!url)('Fleet foundation upgrade',()=>{
 let db:ReturnType<typeof createDb>;
 afterEach(async()=>{await db?.destroy();});
 it('preserves existing identity and defaults while enforcing lifecycle and organizational constraints',async()=>{
  db=createDb(url!);await assertDatabaseTarget(db,'tinywarden_test_p1b');
  await sql`DROP SCHEMA tinywarden CASCADE`.execute(db);await sql`CREATE SCHEMA tinywarden AUTHORIZATION tinywarden`.execute(db);
  const migrator=new Migrator({db,migrationTableSchema:'tinywarden',provider:new FileMigrationProvider({fs,path,migrationFolder:path.resolve('server/db/migrations')})});
  const old=await migrator.migrateTo('030_skill_resources');if(old.error)throw old.error;
  const id=randomUUID(),created=new Date('2026-10-01T12:00:00Z');
  await sql`INSERT INTO tinywarden.hosts(id,label,reported_hostname,os_id,os_version,architecture,enrolled_agent_version,created_at)
   VALUES(${id},'Existing server','old.example','debian','13','amd64','0.0.12',${created})`.execute(db);
  const upgraded=await migrator.migrateToLatest();if(upgraded.error)throw upgraded.error;
  await requireCurrentLedger(db);
  expect(await db.selectFrom('hosts').selectAll().where('id','=',id).executeTakeFirst()).toMatchObject({id,label:'Existing server',created_at:created,lifecycle:'active',fleet_revision:'1',monitoring_epoch:'1',description:'',owner_notes:''});
  expect(await db.selectFrom('data_retention_policy').selectAll().executeTakeFirst()).toMatchObject({days:90,revision:'1'});
  await expect(db.updateTable('hosts').set({lifecycle:'broken' as never}).where('id','=',id).execute()).rejects.toMatchObject({code:'23514'});
  await expect(db.updateTable('data_retention_policy').set({days:0}).execute()).rejects.toMatchObject({code:'23514'});
  await expect(db.updateTable('data_retention_policy').set({days:3651}).execute()).rejects.toMatchObject({code:'23514'});
  const group=randomUUID();await db.insertInto('fleet_groups').values({id:group,name:'Production',created_at:created}).execute();
  await expect(db.insertInto('fleet_groups').values({id:randomUUID(),name:'production',created_at:created}).execute()).rejects.toMatchObject({code:'23505'});
  await db.insertInto('fleet_group_hosts').values({group_id:group,host_id:id}).execute();
  expect(await db.selectFrom('access_group_hosts').selectAll().execute()).toHaveLength(0);
  await expect(db.deleteFrom('fleet_groups').where('id','=',group).execute()).rejects.toMatchObject({code:'23001'});
  // No downgrade can silently erase lifecycle fences.
  await expect(down()).rejects.toThrow('fleet_management_requires_forward_repair');
 });
});
