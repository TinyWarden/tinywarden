export function flag(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value !== "true" && value !== "false") throw new Error("invalid_notifications_configuration");
  return value === "true";
}
export function mailbox(value: string | undefined) {
  if (!value || value.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*\.[A-Za-z]{2,}$/.test(value)
    || value.startsWith(".") || value.includes("..") || value.includes(".@")) throw new Error("invalid_notifications_configuration");
  return value;
}

export function smtpSettings(env:Readonly<Record<string,string|undefined>>,enabled=true){
  const smtp = { host: env.SMTP_HOST ?? "", port: Number(env.SMTP_PORT ?? "465"),
    secure: flag(env.SMTP_SECURE, true), user: env.SMTP_USER ?? "", password: env.SMTP_PASSWORD ?? "" };
  if (enabled && (!smtp.host || smtp.host.length > 253 ||
    !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(smtp.host) || !smtp.user || smtp.user.length > 256 ||
    ["\r", "\n", "\0"].some((control) => smtp.user.includes(control)) || !smtp.password || smtp.password.length > 2048 ||
    !(smtp.port === 465 && smtp.secure || smtp.port === 587 && !smtp.secure))) throw new Error("invalid_notifications_configuration");
  return smtp;
}
