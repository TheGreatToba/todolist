import type { BatchConflictItem } from "@shared/api";

const REASON_LABELS: Record<string, string> = {
  duplicate_template_date_employee:
    "Cet employé a déjà cette tâche (même modèle, même date).",
  duplicate_in_batch:
    "Doublon dans le lot : même modèle et même date pour cet employé.",
  unassign_multiple_unassigned:
    "Impossible de désassigner : une seule occurrence non assignée par modèle et date.",
};

export function getBatchConflictMessage(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function formatBatchConflictSummary(
  conflicts: BatchConflictItem[],
): string {
  if (conflicts.length === 0) return "";
  const byReason = new Map<string, number>();
  for (const c of conflicts) {
    byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
  }
  return Array.from(byReason.entries())
    .map(([reason, count]) => `${getBatchConflictMessage(reason)} (×${count})`)
    .join(" — ");
}
