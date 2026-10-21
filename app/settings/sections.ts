import { messages } from "@/i18n/messages";

/** Deliberate sidebar order. The first section is also the Settings landing page. */
export const settingsSections = [
  { key: "repositories", href: "/settings/repositories", title: messages.marketplace.repositories, description: messages.settingsPage.repositoriesDescription },
  { key: "agents", href: "/settings/agents", title: messages.agentUpdates.title, description: messages.settingsPage.agentsDescription },
  { key: "users", href: "/settings/users", title: messages.access.title, description: messages.settingsPage.usersDescription },
  { key: "signIn", href: "/settings/sign-in", title: messages.oidc.title, description: messages.settingsPage.signInDescription },
  { key: "data", href: "/settings/data", title: messages.dataSettings.title, description: messages.dataSettings.description },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["key"];
