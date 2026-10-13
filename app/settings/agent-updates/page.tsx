import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {AgentUpdatesClient} from "./agent-updates-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function AgentUpdatesPage(){return <OperatorPageGuard adminOnly title={messages.agentUpdates.settings}><AgentUpdatesClient/></OperatorPageGuard>;}
