import type { Recipe } from "../shared/recipe";

export function steps(): Recipe["steps"] {
  return [
    { step_id: "timer", profile: "fstrim-timer.v1", argv: ["--system", "--no-pager", "--no-ask-password", "--all", "--timestamp=unix", "show",
      "--property=Id,LoadState,ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime,ConditionResult,ConditionTimestamp", "fstrim.timer"] },
    { step_id: "service", profile: "fstrim-service.v1", argv: ["--system", "--no-pager", "--no-ask-password", "--all", "--timestamp=unix", "show",
      "--property=Id,LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus,ExecMainStartTimestamp,ExecMainExitTimestamp,ConditionResult,ConditionTimestamp", "fstrim.service"] },
  ];
}
