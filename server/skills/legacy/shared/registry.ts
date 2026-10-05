import type { BaselineKey, BaselineObservation, Assessment } from "./types";
import type { BaselineValues, Recipe } from "./recipe";
import { steps as packageSteps } from "../packages/definition";
import { steps as rebootSteps } from "../reboot/definition";
import { steps as trimSteps } from "../trim/definition";
import { validPackages } from "../packages/observation";
import { validReboot } from "../reboot/observation";
import { validTrim } from "../trim/observation";
import { assessPackages } from "../packages/assessment";
import { assessReboot } from "../reboot/assessment";
import { assessTrim } from "../trim/versions";

type Adapter = { field: "packages" | "reboot" | "fstrim"; valid: (value: unknown) => boolean;
  steps: (values: BaselineValues) => Recipe["steps"];
  assess: (observation: BaselineObservation, version: number, context: unknown, at?: Date) => Assessment };
// Compatibility registration stays outside the generic engine and shared catalog.
export const baselineAdapters: Record<BaselineKey, Adapter> = {
  "package-updates": { field: "packages", steps: packageSteps, valid: validPackages, assess: assessPackages },
  "reboot-required": { field: "reboot", steps: rebootSteps, valid: validReboot, assess: assessReboot },
  "fstrim-status": { field: "fstrim", steps: trimSteps, valid: validTrim, assess: assessTrim },
};
