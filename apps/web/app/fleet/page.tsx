import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { messages } from "@/i18n/messages";
import { sessionCookie, sessionStatus } from "@/server/access/session";
import { AppError } from "@/server/errors";
import { runtimeContext } from "@/server/http/response";
import { FleetClient } from "./fleet-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FleetPage() {
  const cookie = (await cookies()).get(sessionCookie)?.value;
  if (!cookie) redirect("/login");
  let status: "authorized" | "expired" | "unavailable" = "authorized";
  try {
    const context = runtimeContext();
    await sessionStatus(context.db, cookie, context.clock);
  } catch (error) {
    status = error instanceof AppError && error.status === 401 ? "expired" : "unavailable";
  }
  if (status === "expired") redirect("/login");
  if (status === "unavailable") return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="text-3xl font-semibold">{messages.fleet.title}</h1>
      <p role="alert" className="mt-6">{messages.fleet.unavailable}</p>
    </main>
  );
  return <FleetClient />;
}
