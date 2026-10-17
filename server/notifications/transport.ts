import {submitSmtp} from "../email/transport";
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
    return submitSmtp(settings,message,signal,factory,deadlineMs);
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
