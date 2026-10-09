export type InlineMark = "bold" | "italic" | "underline";
export interface InlineFragment { text: string; marks: InlineMark[] }
export type NotificationSource = { reason_param: string } | { fact: string; type: "string" | "number" | "boolean" }
  | { setting: string } | { catalog_key: string };
export interface NotificationBinding {
  source: NotificationSource; marks?: InlineMark[]; precision?: number;
  plural?: { one_key: string; other_key: string };
}
export interface NotificationRule {
  reason: string; states: ("healthy" | "warning" | "critical")[]; message_key: string;
  parameters: Record<string, NotificationBinding>; marks?: InlineMark[];
}
export interface SkillNotifications { format: 1; rules: NotificationRule[] }
