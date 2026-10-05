import { describe, expect, it } from "vitest";
import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import { randomUUID } from "node:crypto";
import { createSmtpTransport } from "../server/notifications/transport";
import { notificationSettings } from "../server/notifications/config";
import { composeNotification } from "../server/notifications/message";
import { smtpFixture } from "./p4b.smtp.fixture";
import { captureEnv } from "./p4b.fixture";
const settings = notificationSettings({ ...captureEnv, NOTIFICATIONS_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "synthetic-account", SMTP_PASSWORD: "synthetic-password" });
const mail = { eventId: randomUUID(), hostId: randomUUID(), label: "Synthetic host", key: "disk-local" as const,
  state: "warning", sampledAt: new Date("2026-09-30T10:00:00.000Z") };

describe("P4.B SMTP adapter without provider contact", () => {
  it.each([
    ["accepted", "accepted", "relay_accepted"], ["temporary", "transient", "temporary_refusal"],
    ["permanent", "rejected", "permanent_refusal"], ["disconnect", "uncertain", "submission_unknown"],
    ["timeout", "uncertain", "submission_unknown"],
  ] as const)("classifies %s and never retries within the adapter", async (mode, kind, code) => {
    const fixture = await smtpFixture(mode); const options: SMTPConnection.Options[] = [];
    try {
      const adapter = createSmtpTransport(settings, (configured) => {
        options.push(configured);
        // A synthetic loopback server is intentionally plaintext; production options remain verified below.
        return new SMTPConnection({ ...configured, host: "127.0.0.1", port: fixture.port,
          secure: false, ignoreTLS: true, requireTLS: false });
      }, mode === "timeout" ? 250 : 2000);
      const result = await adapter.send(mail, new AbortController().signal);
      expect(result).toEqual({ kind, code }); expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ secure: true, tls: { rejectUnauthorized: true }, logger: false, debug: false,
        transactionLog: false, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10_000 });
      expect(fixture.counts().connections).toBe(1);
      expect(JSON.stringify(result)).not.toContain("synthetic-private-provider-detail");
    } finally { await fixture.close(); }
  });
  it("closes the socket on cancellation after submission without calling it failed delivery", async () => {
    const fixture = await smtpFixture("timeout"), controller = new AbortController();
    try {
      const adapter = createSmtpTransport(settings, (options) => new SMTPConnection({ ...options,
        host: "127.0.0.1", port: fixture.port, secure: false, ignoreTLS: true, requireTLS: false }), 2000);
      const sending = adapter.send(mail, controller.signal); await fixture.submitted; controller.abort();
      expect(await sending).toEqual({ kind: "uncertain", code: "submission_unknown" });
      expect(fixture.counts().messages).toBe(1);
    } finally { await fixture.close(); }
  });
  it("encodes a bounded catalog message with stable identity and no header injection", async () => {
    const first = await composeNotification(settings, { ...mail, label: "Synthetic\r\nBcc: nobody@example.test\x00" });
    const second = await composeNotification(settings, mail);
    const header = first.toString().split("\r\n\r\n")[0]!;
    expect(header).not.toMatch(/\r\nBcc:/); expect(first.length).toBeLessThanOrEqual(16 * 1024);
    expect(header.replace(/\r\n[ \t]+/g, " ")).toContain(`Message-ID: <${mail.eventId}@notifications.example.test>`);
    expect(second.toString().replace(/\r\n[ \t]+/g, " ")).toContain(`Message-ID: <${mail.eventId}@notifications.example.test>`);
    expect(first.toString()).not.toContain(settings.smtp.password);
  });
});
