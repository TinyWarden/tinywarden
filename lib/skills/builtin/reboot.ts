export const reboot = { key: "reboot-required", family: "baseline", category: "packages", displayOrder: 3,
  capability: "exec_observe.debian13.v1", normalizer: "reboot-marker.debian13.v1", evaluator: "reboot-marker.v1",
  selectablePackageMode: false } as const;
