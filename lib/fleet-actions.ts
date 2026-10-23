/** Shared Fleet action policy. This module is safe to use in the browser. */
export const fleetActions = ['metadata','membership','maintenance','editMaintenance','endMaintenance','cancelMaintenance','pause','resume','update','reconnect','restore','archive','delete'] as const;
export type FleetAction = typeof fleetActions[number];
export interface FleetActionSubject {
  lifecycle: string;
  control_supported: boolean;
  maintenance: {phase: 'active'|'scheduled'}|null;
  update?: {available: boolean; reason: string|null; in_progress?: boolean|undefined}|undefined;
}
export function fleetUpdateBusy(subject: FleetActionSubject) {
  return subject.update?.in_progress === true || subject.update?.reason === 'update_in_progress';
}
/** A null reason means eligible; transport/access/revision checks remain authoritative. */
export function fleetActionReason(action: FleetAction, subject: FleetActionSubject): string|null {
  if (subject.lifecycle === 'deleting') return 'server_deleting';
  const active = subject.lifecycle === 'active', paused = subject.lifecycle === 'paused', archived = subject.lifecycle === 'archived';
  if (!active && !paused && !archived) return 'lifecycle_conflict';
  switch (action) {
    case 'metadata': case 'membership': case 'delete': return null;
    case 'archive': return archived ? 'lifecycle_conflict' : null;
    case 'restore': return archived ? null : 'lifecycle_conflict';
    case 'reconnect': return archived ? 'restore_required' : fleetUpdateBusy(subject) ? 'update_in_progress' : null;
    case 'update': return archived ? 'update_host_ineligible' : fleetUpdateBusy(subject) ? 'update_in_progress' : subject.update?.available ? null : subject.update?.reason ?? 'update_agent_upgrade_required';
    case 'pause': return !active ? 'lifecycle_conflict' : !subject.control_supported ? 'agent_upgrade_required' : null;
    case 'resume': return paused ? null : 'lifecycle_conflict';
    case 'maintenance': return !active ? 'lifecycle_conflict' : subject.maintenance ? 'maintenance_changed' : null;
    case 'editMaintenance': return !active ? 'lifecycle_conflict' : subject.maintenance ? null : 'maintenance_changed';
    case 'endMaintenance': return !active ? 'lifecycle_conflict' : subject.maintenance?.phase === 'active' ? null : 'maintenance_changed';
    case 'cancelMaintenance': return !active ? 'lifecycle_conflict' : subject.maintenance?.phase === 'scheduled' ? null : 'maintenance_changed';
  }
}
export function partitionFleetAction<T extends FleetActionSubject>(action: FleetAction, subjects: readonly T[]) {
  const eligible: T[] = [], skipped: {subject: T; reason: string}[] = [];
  for (const subject of subjects) {
    const reason = fleetActionReason(action, subject);
    if (reason === null) eligible.push(subject); else skipped.push({subject, reason});
  }
  return {eligible, skipped};
}
/** Scheduled/active/expired classification uses the same server instant in reads and commands. */
export function maintenancePhase(window: {starts_at: string|Date; ends_at: string|Date|null}|undefined, at: Date) {
  if (!window || window.ends_at !== null && +new Date(window.ends_at) <= +at) return null;
  return {phase: +new Date(window.starts_at) <= +at ? 'active' as const : 'scheduled' as const};
}
