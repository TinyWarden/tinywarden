import messages from "../../messages/en.json";
import type { Mail } from "./types";
import type { Settings } from "./config";
import { readSnapshot, safeIdentity } from "./snapshot";
import { detailsHtml, escapeHtml } from "../../lib/skills/notification-details";

const copy = messages.notificationV2;
function substitute(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-z]+)\}/g, (_, key: string) => values[key] ?? "");
}
export function messageV2(settings: Settings, mail: Mail): { subject: string; text: string; html: string } {
  if (!Number.isFinite(mail.sampledAt.getTime()) || !/^[0-9a-f-]{36}$/.test(mail.hostId)) throw new Error("invalid_notification_message");
  const s = readSnapshot(mail.snapshot, mail.key, mail.sampledAt), contact = mail.key === "contact", healthy = mail.state === "healthy";
  if (contact ? !["offline", "healthy"].includes(mail.state) : !["warning", "critical", "healthy"].includes(mail.state))
    throw new Error("invalid_notification_message");
  const family = contact ? healthy ? "contactRestored" : "contactLost" : healthy ? "resolved" : "issue";
  const server = s?.host_label ?? safeIdentity(mail.label, 128);
  const skill = s?.skill_name ?? safeIdentity(mail.checkName ?? messages.notifications.checks[mail.key as keyof typeof messages.notifications.checks] ?? mail.key, 200);
  const severity = copy.subjectSeverities[mail.state as keyof typeof copy.subjectSeverities] ?? "";
  const subject = substitute(copy.subjects[family], { server, skill, severity });
  const zone = s?.time_zone ?? "UTC";
  const time = (value: string | Date) => `${new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value))} (${zone})`;
  const rows: [string, string][] = [[copy.labels.server, server]];
  if (!contact) rows.push([copy.labels.skill, skill]);
  if (healthy) {
    if (!contact && (mail.fromState === "warning" || mail.fromState === "critical")) rows.push([copy.labels.previousSeverity, copy.states[mail.fromState]]);
    rows.push([copy.labels.state, copy.states.healthy]);
  } else rows.push([copy.labels.severity, contact ? copy.states.critical : copy.states[mail.state as "warning" | "critical"]]);
  rows.push([copy.labels.detected, time(mail.sampledAt)]);
  if (contact && s?.contact_at) {
    rows.push([healthy ? copy.labels.contactReceived : copy.labels.lastContact, time(s.contact_at)]);
    if (!healthy) {
      const count = String(Math.floor((mail.sampledAt.getTime() - Date.parse(s.contact_at)) / 60000));
      rows.push([copy.labels.elapsed, substitute(count === "1" ? copy.minutesOne : copy.minutesOther, { count })]);
    }
  } else if (!contact && s?.reading_at) rows.push([copy.labels.reading, time(s.reading_at)]);
  const fragments = s?.details ?? null, link = `${settings.origin}/fleet/${mail.hostId}`;
  const text = [copy.headings[family], copy.introductions[family], "", ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(fragments ? ["", `${copy.labels.details}: ${fragments.map((f) => f.text).join("")}`] : []),
    ...(contact && !healthy ? ["", copy.contactHelp] : []), "", `${copy.openServer}: ${link}`, "", copy.deliveryNote].join("\n");
  const color = healthy ? "#176342" : contact || mail.state === "critical" ? "#b52620" : "#8c5800";
  const html = `<html lang="en"><body style="margin:0;background:#f6f4ee;color:#110d22;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e3ded3;border-radius:12px">` +
    `<h1 style="font-size:24px;margin:0 0 12px;color:${color}">${escapeHtml(copy.headings[family])}</h1><p>${escapeHtml(copy.introductions[family])}</p>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><th align="left" style="padding:6px 16px 6px 0;vertical-align:top;font-weight:normal;color:#69627e">${escapeHtml(k)}</th><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join("")}</table>` +
    (fragments ? `<p><strong>${escapeHtml(copy.labels.details)}:</strong> ${detailsHtml(fragments)}</p>` : "") +
    (contact && !healthy ? `<p>${escapeHtml(copy.contactHelp)}</p>` : "") +
    `<p><a href="${escapeHtml(link)}" style="color:#5030da">${escapeHtml(copy.openServer)}</a></p><p style="font-size:13px;color:#69627e">${escapeHtml(copy.deliveryNote)}</p></main></body></html>`;
  return { subject, text, html };
}
