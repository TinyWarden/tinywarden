import { describe, expect, it } from "vitest";
import { notificationSettings } from "../server/notifications/config";
import { captureEnv } from "./p4b.fixture";
const smtp = { ...captureEnv, NOTIFICATIONS_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.test", SMTP_PORT: "465",
  SMTP_SECURE: "true", SMTP_USER: "synthetic-user", SMTP_PASSWORD: "synthetic-password" };
describe("P4.B mail configuration", () => {
  it("defaults disabled and scopes changes without treating password rotation as an incident", () => {
    expect(notificationSettings({}).transport).toBe("disabled");
    const original = notificationSettings(smtp);
    expect(notificationSettings({ ...smtp, SMTP_PASSWORD: "rotated-synthetic" }).fingerprint).toEqual(original.fingerprint);
    for (const patch of [{ NOTIFICATIONS_TO: "different@example.test" }, { NOTIFICATIONS_TRANSPORT: "capture" },
      { NOTIFICATIONS_INCLUDE_WARNINGS: "false" }, { PUBLIC_ORIGIN: "https://different.example.test" }]) {
      expect(notificationSettings({ ...smtp, ...patch }).fingerprint).not.toEqual(original.fingerprint);
    }
    expect(notificationSettings({ ...smtp, SMTP_PORT: "587", SMTP_SECURE: "false" }).smtp.secure).toBe(false);
  });
  it.each([{ NOTIFICATIONS_TO: "a@example.test,b@example.test" }, { NOTIFICATIONS_FROM: "Sender <a@example.test>" },
    { NOTIFICATIONS_TO: "a@example.test\r\nBcc: b@example.test" }, { PUBLIC_ORIGIN: "http://example.test" },
    { SMTP_SECURE: "false" }, { SMTP_PORT: "25" }, { SMTP_PASSWORD: "" }, { SMTP_HOST: "https://smtp.example.test" },
    { NOTIFICATIONS_RECOVERIES: "yes" }])("rejects malformed settings without echoing the supplied value", (patch) => {
      expect(() => notificationSettings({ ...smtp, ...patch })).toThrow("configuration");
    });
});
