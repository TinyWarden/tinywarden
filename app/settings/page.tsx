import AgentUpdatesPage from "./agent-updates/page";
import AccessPage from "./access/page";
import RepositoriesPage from "./repositories/page";
import { settingsSections, type SettingsSection } from "./sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pages = { updates: AgentUpdatesPage, access: AccessPage, repositories: RepositoriesPage } satisfies Record<SettingsSection, typeof AgentUpdatesPage>;

export default function SettingsPage() {
  const FirstPage = pages[settingsSections[0].key];
  return <FirstPage />;
}
