import { messages } from "@/i18n/messages";
import { OperatorPageGuard } from "@/components/operator/page-guard";
import { FleetClient } from "./_components/fleet-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function FleetPage() { return <OperatorPageGuard title={messages.dashboard.title}><FleetClient /></OperatorPageGuard>; }
