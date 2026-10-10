import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { lifecycleFixture, resetTestSchema, url } from "./p4a.fixture";
import { fetchCheckAssignments } from "../server/skills/assignments/disk";
import { agentAssignments } from "../server/http/handlers";
import { pruneObservationBatch } from "../server/skills/results/retention";
import { retentionCutoff } from "../server/skills/results/retention-policy";

describe.skipIf(!url)("durable per-agent allocation guards",()=>{
  it("preserves exact retries, limits new storage and returns budget after retention",async()=>{
    await resetTestSchema();const f=await lifecycleFixture();
    try {
      const input=f.disk(1);expect((await f.diskPost(input)).status).toBe(200);
      const owner=await f.db.selectFrom("agents").select("id").where("host_id","=",f.hostId).executeTakeFirstOrThrow();
      const budget=async()=> (await sql<{used_bytes:string}>`SELECT used_bytes FROM tinywarden.agent_storage_budgets WHERE agent_id=${owner.id}`.execute(f.db)).rows[0]!;
      const before=await budget();
      await sql`UPDATE tinywarden.agent_storage_budgets SET max_bytes=used_bytes WHERE agent_id=${owner.id}`.execute(f.db);
      expect((await f.diskPost(input)).status).toBe(200);expect(await budget()).toEqual(before);
      expect((await f.diskPost({...input,run_id:randomUUID(),run_sequence:2})).status).toBe(503);
      expect(await budget()).toEqual(before);
      const old=new Date(f.clock().getTime()-91*86400000);
      await f.db.updateTable("disk_runs").set({received_at:old}).where("id","=",input.run_id).execute();
      await pruneObservationBatch(f.db,"disk",retentionCutoff(f.clock()),f.clock());
      expect(Number((await budget()).used_bytes)).toBeLessThan(Number(before.used_bytes));
      expect((await f.diskPost(input)).status).toBe(200);
      expect(await f.db.selectFrom("disk_run_receipts").select("id").where("id","=",input.run_id).execute()).toHaveLength(1);
    } finally {await f.db.destroy();}
  });
  it("rate limits atomic capability churn without advancing the revision",async()=>{
    await resetTestSchema();const f=await lifecycleFixture();
    try {
      const before=await f.db.selectFrom("check_assignment_snapshots").select("id").where("host_id","=",f.hostId).execute();
      const response=await agentAssignments(f.req("/api/v1/agent/assignments",{schema_version:1,agent_version:"test",
        capabilities:[],known_assignment:null},f.agentCredential),f.ctx);
      expect(response.status).toBe(503);
      expect(await f.db.selectFrom("check_assignment_snapshots").select("id").where("host_id","=",f.hostId).execute()).toEqual(before);
      // Unchanged delivery remains available inside the transition cooldown.
      const same=await fetchCheckAssignments(f.db,f.agentCredential,{agentVersion:"test",capabilities:["disk_usage.v1"],known:null},f.clock);
      expect(same.assignment_id).toBeDefined();
    } finally {await f.db.destroy();}
  });
});
