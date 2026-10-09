import pinned from "./fixtures/official-packages.json";
import type { PackageMetadata } from "../../../lib/skills/package-types";
export function notificationMetadata(alias: keyof typeof pinned.packages): PackageMetadata {
  const p = pinned.packages[alias], f = p.files as Record<string, string>;
  return { manifest: JSON.parse(f["skill.json"]!), catalog: JSON.parse(f["messages/en.json"]!),
    schemas: { settings: JSON.parse(f["settings.schema.json"]!), observation: JSON.parse(f["observation.schema.json"]!), state: JSON.parse(f["state.schema.json"]!) },
    notifications: JSON.parse(f["notifications.json"]!), content_sha256: p.content_sha256, size: 0 };
}
