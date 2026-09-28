import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { locale, messages } from "@/i18n/messages";
import { sessionCookie } from "@/server/access/session";
import { AppError } from "@/server/errors";
import { detailHost, type HostProjection } from "@/server/fleet/inventory";
import { runtimeContext } from "@/server/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium",
  timeStyle: "short", timeZone: "UTC" });
function date(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) + " " + messages.fleet.utc : messages.fleet.never;
}

export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const cookie = (await cookies()).get(sessionCookie)?.value;
  if (!cookie) redirect("/login");
  const { id } = await params;
  let host: HostProjection | null = null;
  let asOf = "";
  let state: "ready" | "unauthorized" | "not_found" | "unavailable" = "ready";
  try {
    const context = runtimeContext();
    const result = await detailHost(context.db, cookie, id, context.clock);
    host = result.host;
    asOf = result.as_of;
  } catch (error) {
    state = error instanceof AppError && error.status === 401 ? "unauthorized"
      : error instanceof AppError && (error.status === 404 || error.status === 400)
        ? "not_found" : "unavailable";
  }
  if (state === "unauthorized") redirect("/login");
  return (
    <main id="main" tabIndex={-1} className="mx-auto min-h-dvh max-w-5xl px-5 py-6 sm:px-10">
      <header className="flex items-center justify-between border-b pb-5">
        <Link href="/" className="text-xl font-semibold">{messages.home.brand}</Link>
        <Link href="/fleet" className="text-sm font-medium text-primary underline underline-offset-4">
          {messages.fleet.back}
        </Link>
      </header>
      {host ? <>
        <h1 className="mt-12 text-4xl font-semibold tracking-tight">{host.label}</h1>
        <p className="mt-3 text-muted-foreground">{messages.fleet.description}</p>
        <dl className="mt-10 grid gap-x-8 gap-y-6 border-t pt-8 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.lastContact}</dt>
            <dd className="mt-1 font-medium">{date(host.last_contact_at)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.health}</dt>
            <dd className="mt-1 font-medium">{messages.fleet.unknown}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.reportedHostname}</dt>
            <dd className="mt-1 font-medium">{host.reported_hostname}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.operatingSystem}</dt>
            <dd className="mt-1 font-medium">{host.os_id} {host.os_version}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.architecture}</dt>
            <dd className="mt-1 font-medium">{host.architecture}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.agentVersion}</dt>
            <dd className="mt-1 font-medium">{host.agent_version}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{messages.fleet.cadence}</dt>
            <dd className="mt-1 font-medium">{host.heartbeat_interval_seconds} {messages.fleet.seconds}</dd></div>
        </dl>
        <p className="mt-10 text-sm text-muted-foreground">{messages.fleet.asOf} {date(asOf)}</p>
      </> : <div className="mt-12" role="alert">
        <h1 className="text-3xl font-semibold">{messages.fleet.title}</h1>
        <p className="mt-4">{state === "not_found" ? messages.fleet.notFound : messages.fleet.unavailable}</p>
      </div>}
    </main>
  );
}
