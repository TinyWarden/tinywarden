import { messages } from "@/i18n/messages";
import { OperatorPageGuard } from "@/components/operator/page-guard";
import { ManageSkillsClient } from "./manage-client";
import "../_components/skills.css";
import "@/components/skills/repositories.css";
import "@/components/skills/packages.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ManageSkillsPage() {
  return <OperatorPageGuard adminOnly title={messages.marketplace.manage}><ManageSkillsClient /></OperatorPageGuard>;
}
