"use client";
import { useOperatorRead } from "@/components/operator/use-operator-read";
import { validPackages } from "@/components/skills/package-model";
import { PackageSettings } from "./package-settings";

export function SettingsClient() {
  const read = useOperatorRead("/api/v2/operator/skills",validPackages,60000);
  return <PackageSettings read={read} />;
}
