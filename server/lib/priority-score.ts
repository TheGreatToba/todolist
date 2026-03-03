/**
 * Simple task priority score for Pilotage and Today views.
 * Heuristic-based (no ML): overdue, unassigned, due-today, completed.
 * Higher score = more urgent. Used for sorting and "top actions" prioritization.
 */

export interface TaskForPriority {
  date: Date;
  isCompleted: boolean;
  employeeId: string | null;
}

/**
 * Computes a numeric priority score for a daily task relative to a reference day.
 *
 * - Overdue (date before reference, not completed): 100-120 (100 + hours overdue, cap 20)
 * - Unassigned due today: 80
 * - Assigned due today: 50
 * - Completed: 10
 * - Future or other: 30
 *
 * @param task - Task fields needed for scoring
 * @param referenceDateStart - Start of the reference day (e.g. "today" in operational TZ)
 * @param referenceDateEnd - End of the reference day (start of next day)
 */
export function computeTaskPriorityScore(
  task: TaskForPriority,
  referenceDateStart: Date,
  referenceDateEnd: Date,
): number {
  if (task.isCompleted) {
    return 10;
  }

  const taskTime = task.date.getTime();
  const startTime = referenceDateStart.getTime();
  const endTime = referenceDateEnd.getTime();

  // Overdue: due before reference day
  if (taskTime < startTime) {
    const hoursOverdue = (startTime - taskTime) / (60 * 60 * 1000);
    const bonus = Math.min(20, Math.floor(hoursOverdue));
    return 100 + bonus;
  }

  // Due today (in [referenceDateStart, referenceDateEnd))
  if (taskTime >= startTime && taskTime < endTime) {
    return task.employeeId ? 50 : 80;
  }

  // Future or other
  return 30;
}
