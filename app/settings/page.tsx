import { messages } from "@/i18n/messages";
import { OperatorPageGuard } from "@/components/operator/page-guard";
import { SettingsClient } from "./_components/settings-client";
import "./_components/skills.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function SettingsPage() { return <OperatorPageGuard title={messages.dashboard.settingsTitle}><SettingsClient /></OperatorPageGuard>; }
