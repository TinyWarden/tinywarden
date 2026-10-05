import { object, member, integer } from "../shared/json";

export function validPackages(value: unknown): boolean {
  if (!object(value, "mode upgraded installed removed held_back index_freshness state_consistency")) return false;
  return member(value.mode, "upgrade|with-new-pkgs") && value.index_freshness === "unverified" &&
    value.state_consistency === "unverified" &&
    [value.upgraded, value.installed, value.removed, value.held_back].every((v) => integer(v, 1_000_000)) &&
    Number(value.upgraded) + Number(value.installed) + Number(value.removed) + Number(value.held_back) <= 1_000_000;
}
