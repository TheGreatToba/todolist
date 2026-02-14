/**
 * Daily task assignment job: creates DailyTasks for all recurring TaskTemplates
 * for a given date. Call this each morning (via cron or scheduled job).
 */
import prisma from '../lib/db';

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
    let employeeIds: string[] = [];

    if (template.assignedToEmployeeId) {
      employeeIds = [template.assignedToEmployeeId];
    } else if (template.workstationId) {
      const assignments = await prisma.employeeWorkstation.findMany({
        where: { workstationId: template.workstationId },
        select: { employeeId: true },
      });
      employeeIds = assignments.map((a) => a.employeeId);
    }

    if (employeeIds.length === 0) {
      continue;
    }

    for (const employeeId of employeeIds) {
      try {
        const existing = await prisma.dailyTask.findFirst({
          where: {
            taskTemplateId: template.id,
            employeeId,
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
            employeeId,
            date: targetDate,
            isCompleted: false,
          },
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Template ${template.id} / Employee ${employeeId}: ${msg}`);
      }
    }
  }

  return { created, skipped, errors };
}
