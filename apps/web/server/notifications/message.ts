import MailComposer from "nodemailer/lib/mail-composer/index.js";
import messages from "../../messages/en.json";
import type { Settings } from "./config";
import type { Mail } from "./types";

export async function composeNotification(settings: Settings, mail: Mail): Promise<Buffer> {
  const text = messages.notifications;
  const label = mail.label.replace(/\p{Cc}/gu, "").slice(0, 128);
  const key = text.checks[mail.key], state = text.states[mail.state as keyof typeof text.states];
  if (!key || !state || !Number.isFinite(mail.sampledAt.getTime())) throw new Error("invalid_notification_message");
  const composer = new MailComposer({ from: settings.from, to: settings.to,
    subject: mail.state === "healthy" ? text.recoverySubject : text.problemSubject,
    messageId: `<${mail.eventId}@${new URL(settings.origin).hostname}>`, date: mail.sampledAt,
    text: [text.introduction, `${text.host}: ${label}`, `${text.check}: ${key}`,
      `${text.state}: ${state}`, `${text.sampled}: ${mail.sampledAt.toISOString()}`,
      `${text.details}: ${settings.origin}/fleet/${mail.hostId}`, text.deliveryNote].join("\n"),
    disableFileAccess: true, disableUrlAccess: true });
  const message = await composer.compile().build();
  if (message.length > 16 * 1024) throw new Error("notification_message_too_large");
  return message;
}
