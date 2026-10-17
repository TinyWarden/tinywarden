import {flag,mailbox,smtpSettings} from "../email/config";
import { createHash } from "node:crypto";
import { parseOrigin } from "../config";
export interface Settings {
  transport: "disabled" | "capture" | "smtp"; fingerprint: Buffer;
  from: string; to: string; origin: string; warnings: boolean; recoveries: boolean;
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
}
export function templateFingerprint(settings: Omit<Settings, "fingerprint">, version: 1 | 2): Buffer {
  const { transport, smtp, from, to, warnings, recoveries, origin } = settings;
  return createHash("sha256").update(JSON.stringify([transport, smtp.host, smtp.port,
    smtp.secure, smtp.user, from, to, warnings, recoveries, origin, version])).digest();
}
export function notificationSettings(env: Readonly<Record<string, string | undefined>>): Settings {
  const transport = env.NOTIFICATIONS_TRANSPORT ?? "disabled";
  if (!["disabled", "capture", "smtp"].includes(transport)) throw new Error("invalid_notifications_configuration");
  const disabled = transport === "disabled";
  const from = disabled ? "" : mailbox(env.NOTIFICATIONS_FROM), to = disabled ? "" : mailbox(env.NOTIFICATIONS_TO);
  const origin = disabled ? "" : parseOrigin(env.PUBLIC_ORIGIN);
  const warnings = flag(env.NOTIFICATIONS_INCLUDE_WARNINGS, true), recoveries = flag(env.NOTIFICATIONS_RECOVERIES, true);
  const smtp=smtpSettings(env,transport==="smtp");
  const settings = { transport: transport as Settings["transport"], from, to, origin, warnings, recoveries, smtp };
  return { ...settings, fingerprint: templateFingerprint(settings, 2) };
}
