export const retentionDays = 90;
export const retentionBatchSize = 100;
export const retentionBatchLimit = 10;
export const retentionBudgetMs = 30_000;
export function retentionCutoff(at: Date): Date {
  if (!Number.isFinite(at.getTime())) throw new Error("invalid_retention_clock");
  return new Date(at.getTime() - retentionDays * 86_400_000);
}
