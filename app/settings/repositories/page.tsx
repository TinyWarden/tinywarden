import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {SettingsShell} from "../settings-shell";
import {RepositorySettings} from "@/components/skills/repository-settings";
import "../settings.css";
import "@/components/skills/repositories.css";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function Page(){return <OperatorPageGuard adminOnly title={messages.marketplace.repositories}><SettingsShell active="repositories"><RepositorySettings/></SettingsShell></OperatorPageGuard>;}
