import { disk } from "./builtin/disk";
import { packages } from "./builtin/packages";
import { reboot } from "./builtin/reboot";
import { trim } from "./builtin/trim";

// Registration order preserves the existing wire contract; display order is separate.
export const builtins = [disk, packages, reboot, trim] as const;
export type Skill = typeof builtins[number];
export type SkillKey = Skill["key"];
export type BaselineSkill = Extract<Skill, { family: "baseline" }>;
export type BaselineKey = BaselineSkill["key"];
export const skillKeys = builtins.map((s) => s.key);
export const baselineSkills = builtins.filter((s): s is BaselineSkill => s.family === "baseline");
export const baselineKeys = baselineSkills.map((s) => s.key);
export const displayKeys = [...builtins].sort((a, b) => a.displayOrder - b.displayOrder).map((s) => s.key);
export const normalizers = Object.fromEntries(baselineSkills.map((s) => [s.key, s.normalizer])) as Record<BaselineKey, string>;
export const evaluators = Object.fromEntries(baselineSkills.map((s) => [s.key, s.evaluator])) as Record<BaselineKey, string>;
export function findSkill(key: unknown): Skill | undefined { return builtins.find((s) => s.key === key); }
