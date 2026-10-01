import { createDb } from "../server/db/client";
import { parseDatabaseUrl } from "../server/config";
import { notificationSettings } from "../server/notifications/config";
import { configureNotifications, notificationStatus, pauseNotifications, acknowledgeUncertainty } from "../server/notifications/control";
import { runNotifications } from "../server/notifications/run";
import { createCaptureTransport, createSmtpTransport } from "../server/notifications/transport";
import messages from "../messages/en.json";

async function main() {
  const [action, flag, expected, extra] = process.argv.slice(2);
  if (flag !== "--expected-database" || !expected || !/^[a-zA-Z0-9_]+$/.test(expected) ||
    !["configure", "run", "status", "acknowledge"].includes(action ?? "") ||
    process.argv.length > 6 || (action === "configure" ? extra && extra !== "--rotate"
      : action === "acknowledge" ? !extra : !!extra)) throw new Error("usage");
  const url = parseDatabaseUrl(process.env.DATABASE_URL, "tinywarden");
  if (new URL(url).pathname !== `/${expected}`) throw new Error("wrong_database");
  const db = createDb(url);
  try {
    let result;
    if (action === "status") result = await notificationStatus(db, expected);
    else if (action === "acknowledge") result = await acknowledgeUncertainty(db, expected, extra!);
    else {
      let settings;
      try { settings = notificationSettings(process.env); }
      catch { await pauseNotifications(db, expected); throw new Error("invalid_configuration"); }
      if (action === "configure") result = await configureNotifications(db, expected, settings, extra === "--rotate");
      else if (settings.transport === "disabled") result = { outcome: "disabled" };
      else result = await runNotifications(db, expected, settings, settings.transport === "capture"
        ? createCaptureTransport(settings) : createSmtpTransport(settings));
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await db.destroy(); }
}
main().catch(() => { process.stderr.write(`${messages.notificationsCli.failed}\n`); process.exitCode = 1; });
