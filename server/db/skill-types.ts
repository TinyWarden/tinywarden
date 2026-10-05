import type { ColumnType } from "kysely";
type Counter = ColumnType<string, string | number | undefined, string | number>;
type Instant = ColumnType<Date, Date | string | undefined, Date | string>;
export interface SkillControl {
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  enablement_version: Counter; enablement_changed_at: Instant;
}
export interface SkillEnablementReceipts {
  operator_id: string; request_id: string; skill_key: string; request_fingerprint: Buffer;
  previous_enabled: boolean; resulting_enabled: boolean; previous_version: Counter;
  resulting_version: Counter; changed: boolean; completed_at: Instant; correlation_id: string;
}
