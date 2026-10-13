import { messages } from "@/i18n/messages";

/** Deliberate sidebar order. The first section is also the Settings landing page. */
export const settingsSections = [
  { key: "updates", href: "/settings/agent-updates", title: messages.agentUpdates.title },
  { key: "access", href: "/settings/access", title: messages.access.title },
  { key: "repositories", href: "/settings/repositories", title: messages.marketplace.repositories },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["key"];
