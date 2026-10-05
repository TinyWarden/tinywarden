import { messages } from "@/i18n/messages";
import { WardenAvatar } from "./avatar";

export function BrandLogo({ ground = "paper" }: { ground?: "paper" | "ink" }) {
  return <span className={`tw-logo tw-logo--${ground}`} aria-hidden="true">
    <WardenAvatar className="tw-logo-avatar" />
    <span className="tw-logo-chip"><span>{messages.brand.tiny}</span></span>
    <span className="tw-logo-word"><span>{messages.brand.wordmark}</span></span>
  </span>;
}
