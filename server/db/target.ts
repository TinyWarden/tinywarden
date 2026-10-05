import { sql, type Kysely } from "kysely";

export async function assertDatabaseTarget<T>(db: Kysely<T>, expected: string,
  requireSchema = true): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(expected)) throw new Error("wrong_database");
  const { rows } = await sql<{ database_name: string; session_role: string;
    current_role: string; database_owner: string; schema_owner: string | null }>`
    SELECT current_database() AS database_name, session_user AS session_role,
      current_user AS current_role,
      (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner,
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='tinywarden') AS schema_owner`.execute(db);
  const target = rows[0];
  if (!target || target.database_name !== expected || target.session_role !== "tinywarden" ||
      target.current_role !== "tinywarden" || target.database_owner !== "tinywarden" ||
      (requireSchema ? target.schema_owner !== "tinywarden" :
        target.schema_owner !== null && target.schema_owner !== "tinywarden")) throw new Error("wrong_database_owner");
}
