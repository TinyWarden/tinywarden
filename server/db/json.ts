import { sql, type RawBuilder } from "kysely";
// pg encodes JavaScript arrays as PostgreSQL arrays; JSON evidence must use JSONB.
export function jsonValue<T>(value: T): RawBuilder<T> { return sql<T>`${JSON.stringify(value)}::jsonb`; }
