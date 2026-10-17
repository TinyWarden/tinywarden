import AgentsPage from "./agents/page";
import SignInPage from "./sign-in/page";
import UsersPage from "./users/page";
import RepositoriesPage from "./repositories/page";
import { settingsSections, type SettingsSection } from "./sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pages = { agents: AgentsPage, users: UsersPage, repositories: RepositoriesPage, signIn: SignInPage } satisfies Record<SettingsSection, typeof AgentsPage>;

export default function SettingsPage() {
  const FirstPage = pages[settingsSections[0].key];
  return <FirstPage />;
}
