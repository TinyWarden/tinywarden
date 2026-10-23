import {sql,type Kysely} from "kysely";

export async function up(db:Kysely<unknown>){
  await sql`CREATE TABLE tinywarden.agent_update_requests (
    id uuid PRIMARY KEY, operation_id uuid NOT NULL, host_id uuid NOT NULL,
    agent_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
    target_version text NOT NULL CHECK(length(target_version)<=64),
    manifest text NOT NULL CHECK(octet_length(manifest)<=16384),
    signature text NOT NULL CHECK(octet_length(signature)<=256),
    state text NOT NULL CHECK(state IN ('queued','installing','confirming','succeeded','failed')),
    error text CHECK(length(error)<=64), created_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL CHECK(expires_at>created_at),
    started_at timestamptz(3), updated_at timestamptz(3) NOT NULL, completed_at timestamptz(3),
    UNIQUE(operation_id,host_id),
    FOREIGN KEY(operation_id,host_id) REFERENCES tinywarden.fleet_operation_items(operation_id,host_id) ON DELETE CASCADE,
    CHECK((state IN ('succeeded','failed'))=(completed_at IS NOT NULL)))`.execute(db);
  await sql`CREATE UNIQUE INDEX agent_update_one_active ON tinywarden.agent_update_requests(host_id)
    WHERE state IN ('queued','installing','confirming')`.execute(db);
  await sql`CREATE INDEX agent_update_delivery ON tinywarden.agent_update_requests(agent_id,generation,created_at)
    WHERE state IN ('queued','installing','confirming')`.execute(db);
}
export async function down(){throw new Error("Forward repair required for durable update requests");}
