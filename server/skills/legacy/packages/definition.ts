import type { BaselineValues, Recipe } from "../shared/recipe";

export function steps(values: BaselineValues): Recipe["steps"] {
  return [{ step_id: "apt", profile: "apt-upgrade.v1", argv: values.package_mode === "upgrade"
    ? ["--simulate", "upgrade"] : ["--simulate", "--with-new-pkgs", "upgrade"] }];
}
