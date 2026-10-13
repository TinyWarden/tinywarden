"use client";
import {PageHeader} from "@/components/playbook/page";
import { messages } from "@/i18n/messages";
import { OperatorShell, ReadNotice } from "@/components/operator/shell";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { validPackages } from "@/components/skills/package-model";
import { SkillsMarketplace } from "@/components/skills/repository-marketplace";

export function ManageSkillsClient() {
  const read = useOperatorRead("/api/v2/operator/skills", validPackages, 60000);
  return <OperatorShell active="skills" asOf={read.value?.as_of}>
    <main id="main" tabIndex={-1} className="tw-ui tw-main tw-skills">
      <PageHeader title={messages.marketplace.manage} description={messages.marketplace.manageHelp}/>
      <ReadNotice expired={read.expired} failed={read.failed} loaded={!!read.value} />
      <SkillsMarketplace installedRefresh={read.reload} skills={read.value?.skills ?? []} uploadsDisabled={!read.value || read.failed || read.expired} />
    </main>
  </OperatorShell>;
}
