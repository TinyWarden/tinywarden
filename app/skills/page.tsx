import { messages } from "@/i18n/messages";
import { OperatorPageGuard } from "@/components/operator/page-guard";
import { SettingsClient } from "./_components/settings-client";
import "./_components/skills.css";
import "@/components/skills/repositories.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function SkillsPage() { return <OperatorPageGuard adminOnly title={messages.dashboard.settingsTitle}><SettingsClient /></OperatorPageGuard>; }
