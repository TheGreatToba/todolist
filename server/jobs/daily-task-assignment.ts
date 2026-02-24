/**
 * Daily task assignment job: creates DailyTasks for all recurring TaskTemplates
 * for a given date. Call this each morning (via cron or scheduled job).
 */
import prisma from "../lib/db";
import {
  addIntervalToDate,
  getAfterCompletionConfig,
  shouldTemplateAppearOnDate,
  shouldTemplateAutoGenerate,
} from "../lib/recurrence";

type GenerationTemplate = {
  id: string;
  title: string;
  description: string | null;
  isRecurring: boolean;
  recurrenceMode: string;
  recurrenceType: string;
  recurrenceDays: string | null;
  recurrenceDayOfMonth: number | null;
  recurrenceInterval: number | null;
  recurrenceIntervalUnit: string | null;
  createdAt: Date;
  workstation: { id: string; name: string } | null;
};

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + 24 * 60 * 60 * 1000);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return (error as { code?: string }).code === "P2002";
}

async function hasTemplateOccurrenceOnDate(
  templateId: string,
  targetDate: Date,
): Promise<boolean> {
  const existing = await prisma.dailyTask.findFirst({
    where: {
      taskTemplateId: templateId,
      date: {
        gte: startOfDay(targetDate),
        lt: endOfDay(targetDate),
      },
    },
    select: { id: true },
  });
  return !!existing;
}

async function hasActivePendingOccurrence(
  templateId: string,
): Promise<boolean> {
  const pendingCount = await prisma.dailyTask.count({
    where: {
      taskTemplateId: templateId,
      isCompleted: false,
    },
  });
  return pendingCount > 0;
}

async function getLatestCompletionAnchorDate(
  templateId: string,
): Promise<Date | null> {
  const completedWithTimestamp = await prisma.dailyTask.findFirst({
    where: {
      taskTemplateId: templateId,
      isCompleted: true,
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  if (completedWithTimestamp?.completedAt) {
    return startOfDay(completedWithTimestamp.completedAt);
  }

  const completedWithoutTimestamp = await prisma.dailyTask.findFirst({
    where: {
      taskTemplateId: templateId,
      isCompleted: true,
    },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (completedWithoutTimestamp?.date) {
    return startOfDay(completedWithoutTimestamp.date);
  }

  return null;
}

export async function isAfterCompletionTemplateDueOnDate(
  template: GenerationTemplate,
  targetDate: Date,
): Promise<boolean> {
  const hasOccurrenceOnTargetDate = await hasTemplateOccurrenceOnDate(
    template.id,
    targetDate,
  );
  if (hasOccurrenceOnTargetDate) {
    return true;
  }

  const afterCompletion = getAfterCompletionConfig(template);
  if (!afterCompletion) {
    return false;
  }

  if (await hasActivePendingOccurrence(template.id)) {
    return false;
  }

  const lastCompletionAnchorDate = await getLatestCompletionAnchorDate(
    template.id,
  );
  const baselineDate =
    lastCompletionAnchorDate ?? startOfDay(template.createdAt);
  const nextDueDate = addIntervalToDate(
    baselineDate,
    afterCompletion.interval,
    afterCompletion.intervalUnit,
  );

  return startOfDay(targetDate).getTime() >= nextDueDate.getTime();
}

export async function isTemplateDueOnDate(
  template: GenerationTemplate,
  targetDate: Date,
): Promise<boolean> {
  if (!shouldTemplateAutoGenerate(template)) {
    return false;
  }

  const afterCompletion = getAfterCompletionConfig(template);
  if (afterCompletion) {
    return isAfterCompletionTemplateDueOnDate(template, targetDate);
  }

  return shouldTemplateAppearOnDate(
    {
      isRecurring: template.isRecurring,
      recurrenceMode: template.recurrenceMode,
      recurrenceType: template.recurrenceType,
      recurrenceDays: template.recurrenceDays,
      recurrenceDayOfMonth: template.recurrenceDayOfMonth,
    },
    targetDate,
  );
}

export async function assignDailyTasksForDate(date: Date): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const targetDate = startOfDay(date);

  const recurringTemplates = await prisma.taskTemplate.findMany({
    where: { isRecurring: true },
    include: {
      workstation: {
        select: { id: true, name: true },
      },
    },
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const template of recurringTemplates) {
    const dueOnTargetDate = await isTemplateDueOnDate(template, targetDate);
    if (!dueOnTargetDate) {
      continue;
    }

    try {
      const existing = await prisma.dailyTask.findFirst({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: targetDate,
            lt: endOfDay(targetDate),
          },
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          templateSourceId: template.id,
          templateTitle: template.title,
          templateDescription: template.description,
          templateRecurrenceType: template.recurrenceType,
          templateIsRecurring: template.isRecurring,
          templateWorkstationId: template.workstation?.id ?? null,
          templateWorkstationName: template.workstation?.name ?? null,
          employeeId: null,
          date: targetDate,
          status: "UNASSIGNED",
          isCompleted: false,
        },
      });
      created++;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        skipped++;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Template ${template.id}: ${msg}`);
    }
  }

  return { created, skipped, errors };
}
