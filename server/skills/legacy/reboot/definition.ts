import type { Recipe } from "../shared/recipe";

export function steps(): Recipe["steps"] {
  return [{ step_id: "marker", profile: "reboot-marker.v1", argv: ["-e", "/run/reboot-required"] }];
}
