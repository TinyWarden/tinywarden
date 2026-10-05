import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { messages } from "@/i18n/messages";
import { sessionCookie } from "@/server/access/session";
import { AppError } from "@/server/errors";
import { detailHost } from "@/server/fleet/inventory";
import { runtimeContext } from "@/server/http/response";
import { OperatorShell } from "@/components/operator/shell";
import { ServerClient } from "./_components/server-client";
import "./_components/server.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const cookie = (await cookies()).get(sessionCookie)?.value;
  if (!cookie) redirect("/login");
  const { id } = await params;
  let result, failure = messages.fleet.unavailable;
  try { const ctx = runtimeContext(); result = await detailHost(ctx.db, cookie, id, ctx.clock); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    if (error instanceof AppError && [400,404].includes(error.status)) failure = messages.fleet.notFound;
  }
  return result ? <ServerClient initial={{ schema_version: 1, ...result }} />
    : <OperatorShell active="servers"><main id="main" tabIndex={-1} className="tw-main tw-server"><h1>{messages.fleet.title}</h1><p role="alert">{failure}</p></main></OperatorShell>;
}
