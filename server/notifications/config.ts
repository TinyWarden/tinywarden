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
function flag(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value !== "true" && value !== "false") throw new Error("invalid_notifications_configuration");
  return value === "true";
}
function mailbox(value: string | undefined) {
  if (!value || value.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*\.[A-Za-z]{2,}$/.test(value)
    || value.startsWith(".") || value.includes("..") || value.includes(".@")) throw new Error("invalid_notifications_configuration");
  return value;
}
export function notificationSettings(env: Readonly<Record<string, string | undefined>>): Settings {
  const transport = env.NOTIFICATIONS_TRANSPORT ?? "disabled";
  if (!["disabled", "capture", "smtp"].includes(transport)) throw new Error("invalid_notifications_configuration");
  const disabled = transport === "disabled";
  const from = disabled ? "" : mailbox(env.NOTIFICATIONS_FROM), to = disabled ? "" : mailbox(env.NOTIFICATIONS_TO);
  const origin = disabled ? "" : parseOrigin(env.PUBLIC_ORIGIN);
  const warnings = flag(env.NOTIFICATIONS_INCLUDE_WARNINGS, true), recoveries = flag(env.NOTIFICATIONS_RECOVERIES, true);
  const smtp = { host: env.SMTP_HOST ?? "", port: Number(env.SMTP_PORT ?? "465"),
    secure: flag(env.SMTP_SECURE, true), user: env.SMTP_USER ?? "", password: env.SMTP_PASSWORD ?? "" };
  if (transport === "smtp" && (!smtp.host || smtp.host.length > 253 ||
    !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(smtp.host) || !smtp.user || smtp.user.length > 256 ||
    ["\r", "\n", "\0"].some((control) => smtp.user.includes(control)) || !smtp.password || smtp.password.length > 2048 ||
    !(smtp.port === 465 && smtp.secure || smtp.port === 587 && !smtp.secure))) throw new Error("invalid_notifications_configuration");
  const settings = { transport: transport as Settings["transport"], from, to, origin, warnings, recoveries, smtp };
  return { ...settings, fingerprint: templateFingerprint(settings, 2) };
}
