import {sql,type Kysely} from "kysely";
export async function up(db:Kysely<unknown>){await sql`CREATE TABLE operator_dashboard_layouts (
  operator_id uuid PRIMARY KEY REFERENCES operators(id), layout jsonb NOT NULL CHECK (octet_length(layout::text)<=16384 AND jsonb_typeof(layout)='object'),
  revision bigint NOT NULL CHECK (revision>0 AND revision<=9007199254740991), updated_at timestamptz(3) NOT NULL,
  last_request_id uuid NOT NULL, last_fingerprint bytea NOT NULL CHECK (octet_length(last_fingerprint)=32)
)`.execute(db);}
export async function down():Promise<void>{throw new Error("dashboard_layout_requires_forward_repair");}
