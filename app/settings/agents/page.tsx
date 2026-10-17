import {messages} from "@/i18n/messages";
import {OperatorPageGuard} from "@/components/operator/page-guard";
import {AgentsClient} from "./agents-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function AgentsPage(){return <OperatorPageGuard adminOnly title={messages.agentUpdates.title}><AgentsClient/></OperatorPageGuard>;}
