/**
 * Daily task assignment job: creates DailyTasks for all recurring TaskTemplates
 * for a given date. Call this each morning (via cron or scheduled job).
 */
import prisma from "../lib/db";
import { shouldTemplateAppearOnDate } from "../lib/recurrence";

export async function assignDailyTasksForDate(date: Date): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const recurringTemplates = await prisma.taskTemplate.findMany({
    where: { isRecurring: true },
    include: {
      workstation: true,
      assignedToEmployee: true,
    },
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const template of recurringTemplates) {
    if (
      !shouldTemplateAppearOnDate(
        {
          isRecurring: template.isRecurring,
          recurrenceType: template.recurrenceType,
          recurrenceDays: template.recurrenceDays,
        },
        targetDate,
      )
    ) {
      continue;
    }

    try {
      const existing = await prisma.dailyTask.findFirst({
        where: {
          taskTemplateId: template.id,
          employeeId: null,
          status: "UNASSIGNED",
          date: {
            gte: targetDate,
            lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          employeeId: null,
          date: targetDate,
          status: "UNASSIGNED",
          isCompleted: false,
        },
      });
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Template ${template.id}: ${msg}`);
    }
  }

  return { created, skipped, errors };
}
