import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {PreferencesClient} from "./preferences-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function PreferencesPage(){return <OperatorPageGuard title={messages.agentUpdates.settings}><PreferencesClient/></OperatorPageGuard>;}
