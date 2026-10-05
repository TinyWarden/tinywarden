import { messages } from "@/i18n/messages";
import { OperatorPageGuard } from "@/components/operator/page-guard";
import { HistoryClient } from "./history-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  const { host } = await searchParams;
  return <OperatorPageGuard title={messages.dashboard.historyTitle}><HistoryClient host={typeof host === "string" ? host : undefined} key={host ?? "all"} /></OperatorPageGuard>;
}
