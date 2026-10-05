import SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import { composeNotification } from "./message";
import type { Settings } from "./config";
import type { Mail, Outcome, Transport } from "./types";

type Factory = (options: SMTPConnection.Options) => SMTPConnection;
export function createSmtpTransport(settings: Settings,
  factory: Factory = (options) => new SMTPConnection(options), deadlineMs = 30_000): Transport {
  if (settings.transport !== "smtp") throw new Error("notification_transport_mismatch");
  return { mode: "smtp", async send(mail, signal) {
    let message: Buffer;
    try { message = await composeNotification(settings, mail); }
    catch { return { kind: "rejected", code: "configuration_failed" }; }
    if (signal.aborted) return { kind: "transient", code: "attempt_cancelled" };
    return new Promise<Outcome>((resolve) => {
      let submitted = false, settled = false;
      const connection = factory({ host: settings.smtp.host, port: settings.smtp.port, secure: settings.smtp.secure,
        requireTLS: !settings.smtp.secure, ignoreTLS: false, opportunisticTLS: false,
        tls: { rejectUnauthorized: true }, connectionTimeout: 5000, dnsTimeout: 5000,
        greetingTimeout: 5000, socketTimeout: 10_000, logger: false, debug: false, transactionLog: false });
      const finish = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); signal.removeEventListener("abort", cancel);
        connection.close(); resolve(outcome);
      };
      const cancel = () => finish({ kind: submitted ? "uncertain" : "transient", code: submitted ? "submission_unknown" : "attempt_cancelled" });
      const timer = setTimeout(cancel, deadlineMs);
      signal.addEventListener("abort", cancel, { once: true });
      const failure = (error: SMTPConnection.SMTPError) => {
        if (settled) return;
        const negative = !!error.responseCode && error.responseCode >= 400 && error.responseCode <= 599 &&
          /^(MAIL FROM|RCPT TO|DATA)$/.test(error.command ?? "");
        if (submitted && !negative) { finish({ kind: "uncertain", code: "submission_unknown" }); return; }
        if (negative) { finish({ kind: error.responseCode! < 500 ? "transient" : "rejected",
          code: error.responseCode! < 500 ? "temporary_refusal" : "permanent_refusal" }); return; }
        finish({ kind: ["EAUTH", "ETLS"].includes(error.code ?? "") ? "rejected" : "transient",
          code: ["EAUTH", "ETLS"].includes(error.code ?? "") ? "configuration_failed" : "connection_failed" });
      };
      connection.on("error", failure);
      connection.on("end", () => { if (!settled) finish({ kind: submitted ? "uncertain" : "transient",
        code: submitted ? "submission_unknown" : "connection_failed" }); });
      connection.connect((error) => {
        if (settled) return;
        if (error) { failure(error); return; }
        connection.login({ user: settings.smtp.user, pass: settings.smtp.password }, (authError) => {
          if (settled) return;
          if (authError) { failure(authError); return; }
          submitted = true;
          connection.send({ from: settings.from, to: [settings.to] }, message, (sendError, info) => {
            if (sendError) { failure(sendError); return; }
            if (info.accepted.length === 1 && info.accepted[0] === settings.to && !info.rejected.length)
              finish({ kind: "accepted", code: "relay_accepted" });
            else finish({ kind: "uncertain", code: "submission_unknown" });
          });
        });
      });
    });
  } };
}
export function createCaptureTransport(settings: Settings, captured?: Buffer[]): Transport {
  if (settings.transport !== "capture") throw new Error("notification_transport_mismatch");
  return { mode: "capture", async send(mail: Mail, signal) {
    if (signal.aborted) return { kind: "transient", code: "attempt_cancelled" };
    try { const message = await composeNotification(settings, mail); captured?.push(message); }
    catch { return { kind: "rejected", code: "configuration_failed" }; }
    return { kind: "captured", code: "capture_only" };
  } };
}
