import messages from "../../messages/en.json";
import type { PackageAssessment, PackageMetadata, Scalar, SkillSettings } from "./package-types";
import type { InlineFragment, InlineMark, NotificationBinding } from "./notification-types";

const order: InlineMark[] = ["bold", "italic", "underline"];
const forbidden = /[\p{Cc}\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u206f]|(?:\b[A-Za-z][A-Za-z0-9+.-]*:(?=\S)|www\.)/iu;
export function validFragments(value: unknown): value is InlineFragment[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return false;
  let length = 0;
  for (const f of value) {
    if (!f || typeof f !== "object" || Object.keys(f).sort().join(",") !== "marks,text" ||
      typeof f.text !== "string" || !f.text || forbidden.test(f.text) || !Array.isArray(f.marks) ||
      f.marks.length > 3 || new Set(f.marks).size !== f.marks.length ||
      f.marks.some((m: unknown) => !order.includes(m as InlineMark))) return false;
    length += [...f.text].length;
  }
  const joined = value.map((f) => f.text).join("");
  return length <= 400 && !!joined.trim() && !forbidden.test(joined);
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function detailsHtml(fragments: InlineFragment[]): string {
  if (!validFragments(fragments)) return "";
  return fragments.map((f) => order.reduceRight((text, mark) => {
    const tag = { bold: "strong", italic: "em", underline: "u" }[mark];
    return f.marks.includes(mark) ? `<${tag}>${text}</${tag}>` : text;
  }, escapeHtml(f.text))).join("");
}
function sourceValue(binding: NotificationBinding, metadata: PackageMetadata, assessment: PackageAssessment, settings: SkillSettings): Scalar {
  const source = binding.source;
  let value: Scalar | undefined;
  if ("reason_param" in source) value = assessment.reason.params[source.reason_param];
  else if ("setting" in source) value = Object.hasOwn(settings, source.setting) ? settings[source.setting] : undefined;
  else if ("catalog_key" in source) {
    const entry = metadata.catalog[source.catalog_key];
    if (entry && !Object.keys(entry.parameters).length) value = entry.text;
  } else {
    const facts = assessment.facts.filter((f) => f.key === source.fact);
    const f = facts.length === 1 ? facts[0] : undefined;
    const type = f?.kind === "text" ? "string" : f?.kind === "boolean" ? "boolean" : f?.kind !== "table" ? "number" : null;
    if (f && f.kind !== "table" && type === source.type && typeof f.value === source.type) value = f.value;
  }
  if (value === undefined || typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    throw new Error("notification_details_value");
  return value;
}
/** Split the catalog template first: substituted content is always literal. */
export function resolveDetails(metadata: PackageMetadata, assessment: PackageAssessment, settings: SkillSettings,
  booleanText = messages.notificationV2.booleans): InlineFragment[] | null {
  try {
    const rule = metadata.notifications?.rules.find((r) => r.reason === assessment.reason.key && r.states.includes(assessment.status as "healthy"));
    if (!rule) return null;
    const entry = metadata.catalog[rule.message_key];
    if (!entry || forbidden.test(entry.text)) return null;
    const result: InlineFragment[] = [];
    const push = (text: string, marks: InlineMark[] = []) => { if (text) result.push({ text, marks: order.filter((m) => marks.includes(m)) }); };
    let offset = 0, count = 0;
    for (const match of entry.text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      if (++count > 32) return null;
      push(entry.text.slice(offset, match.index), rule.marks);
      const key = match[1]!, binding = rule.parameters[key];
      if (!binding) return null;
      const value = sourceValue(binding, metadata, assessment, settings);
      let rendered: string;
      if (binding.plural) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
        const plural = metadata.catalog[value === 1 ? binding.plural.one_key : binding.plural.other_key];
        if (!plural || JSON.stringify(plural.parameters) !== '{"count":"number"}') return null;
        rendered = plural.text.replace(/\{count\}/g, String(value));
      } else {
        if (typeof value !== entry.parameters[key]) return null;
        rendered = typeof value === "boolean" ? booleanText[value ? "true" : "false"] :
          typeof value === "number" && binding.precision !== undefined
            ? new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: binding.precision }).format(value) : String(value);
      }
      push(rendered, [...(rule.marks ?? []), ...(binding.marks ?? [])]);
      offset = match.index + match[0].length;
    }
    push(entry.text.slice(offset), rule.marks);
    return validFragments(result) ? result : null;
  } catch { return null; }
}
