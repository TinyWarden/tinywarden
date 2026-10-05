import type { SkillKey } from "./catalog";

export type BaselineValues = { interval_seconds: number; timeout_seconds: number;
  package_mode: "upgrade" | "with-new-pkgs" };
export type SkillValues = { interval_seconds: number; warning_percent?: number; critical_percent?: number;
  timeout_seconds?: number; package_mode?: string };
export type SkillViewEntry = { key: SkillKey; revision: number; saved_at: string; enabled: boolean;
  enablement_version: number; enablement_changed_at: string; values: SkillValues };
export type SkillView = { schema_version: 1; as_of: string; skills: SkillViewEntry[] };
export type DraftReport = { key: SkillKey; dirty: boolean; interval: string };
export type SkillEditorProps = { presentation?: "skill"; onDraftChange?: (report: DraftReport) => void; onSaved?: () => void };
