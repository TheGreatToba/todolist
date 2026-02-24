import { describe, it, expect } from "vitest";
import prisma from "../lib/db";
import { assignDailyTasksForDate } from "./daily-task-assignment";

function asStartOfDay(dateString: string): Date {
  const date = new Date(`${dateString}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
}

function asEndOfDay(dateString: string): Date {
  return new Date(asStartOfDay(dateString).getTime() + 24 * 60 * 60 * 1000);
}

async function createTemplateCreator() {
  const nonce = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return prisma.user.create({
    data: {
      name: `Recurrence V2 Manager ${nonce}`,
      email: `recurrence-v2-${nonce}@test.com`,
      passwordHash: "not-used-in-this-test",
      role: "MANAGER",
    },
    select: { id: true },
  });
}

describe("assignDailyTasksForDate - Recurrence Engine V2", () => {
  it("schedule_based generates on due date and remains idempotent", async () => {
    const createdBy = await createTemplateCreator();
    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: `Weekly Monday template ${Date.now()}`,
          createdById: createdBy.id,
          isRecurring: true,
          recurrenceMode: "schedule_based",
          recurrenceType: "weekly",
          recurrenceDays: "1",
        },
      });
      templateId = template.id;

      const monday = "2026-03-02";
      const tuesday = "2026-03-03";
      await assignDailyTasksForDate(asStartOfDay(monday));
      await assignDailyTasksForDate(asStartOfDay(monday));
      await assignDailyTasksForDate(asStartOfDay(tuesday));

      const mondayCount = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay(monday),
            lt: asEndOfDay(monday),
          },
        },
      });
      const tuesdayCount = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay(tuesday),
            lt: asEndOfDay(tuesday),
          },
        },
      });

      expect(mondayCount).toBe(1);
      expect(tuesdayCount).toBe(0);
    } finally {
      if (templateId) {
        await prisma.dailyTask.deleteMany({
          where: { taskTemplateId: templateId },
        });
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.user.delete({ where: { id: createdBy.id } });
    }
  });

  it("after_completion respects interval and generates only after completion", async () => {
    const createdBy = await createTemplateCreator();
    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: `After completion interval template ${Date.now()}`,
          createdById: createdBy.id,
          isRecurring: true,
          recurrenceMode: "after_completion",
          recurrenceInterval: 3,
          recurrenceIntervalUnit: "day",
        },
      });
      templateId = template.id;

      await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          templateSourceId: template.id,
          templateTitle: template.title,
          templateDescription: template.description,
          templateRecurrenceType: template.recurrenceType,
          templateIsRecurring: template.isRecurring,
          date: asStartOfDay("2026-03-01"),
          status: "DONE",
          isCompleted: true,
          completedAt: asStartOfDay("2026-03-01"),
        },
      });

      await assignDailyTasksForDate(asStartOfDay("2026-03-03"));
      await assignDailyTasksForDate(asStartOfDay("2026-03-04"));

      const beforeDueCount = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay("2026-03-03"),
            lt: asEndOfDay("2026-03-03"),
          },
        },
      });
      const dueDayCount = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay("2026-03-04"),
            lt: asEndOfDay("2026-03-04"),
          },
        },
      });

      expect(beforeDueCount).toBe(0);
      expect(dueDayCount).toBe(1);
    } finally {
      if (templateId) {
        await prisma.dailyTask.deleteMany({
          where: { taskTemplateId: templateId },
        });
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.user.delete({ where: { id: createdBy.id } });
    }
  });

  it("after_completion does not generate when a previous occurrence is still open", async () => {
    const createdBy = await createTemplateCreator();
    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: `After completion with open task ${Date.now()}`,
          createdById: createdBy.id,
          isRecurring: true,
          recurrenceMode: "after_completion",
          recurrenceInterval: 1,
          recurrenceIntervalUnit: "day",
        },
      });
      templateId = template.id;

      await prisma.dailyTask.createMany({
        data: [
          {
            taskTemplateId: template.id,
            templateSourceId: template.id,
            templateTitle: template.title,
            templateDescription: template.description,
            templateRecurrenceType: template.recurrenceType,
            templateIsRecurring: template.isRecurring,
            date: asStartOfDay("2026-03-01"),
            status: "DONE",
            isCompleted: true,
            completedAt: asStartOfDay("2026-03-01"),
          },
          {
            taskTemplateId: template.id,
            templateSourceId: template.id,
            templateTitle: template.title,
            templateDescription: template.description,
            templateRecurrenceType: template.recurrenceType,
            templateIsRecurring: template.isRecurring,
            date: asStartOfDay("2026-03-02"),
            status: "UNASSIGNED",
            isCompleted: false,
          },
        ],
      });

      await assignDailyTasksForDate(asStartOfDay("2026-03-03"));

      const count = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay("2026-03-03"),
            lt: asEndOfDay("2026-03-03"),
          },
        },
      });

      expect(count).toBe(0);
    } finally {
      if (templateId) {
        await prisma.dailyTask.deleteMany({
          where: { taskTemplateId: templateId },
        });
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.user.delete({ where: { id: createdBy.id } });
    }
  });

  it("manual_trigger templates are never auto-generated", async () => {
    const createdBy = await createTemplateCreator();
    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: `Manual template ${Date.now()}`,
          createdById: createdBy.id,
          isRecurring: true,
          recurrenceMode: "manual_trigger",
        },
      });
      templateId = template.id;

      await assignDailyTasksForDate(asStartOfDay("2026-03-05"));

      const count = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay("2026-03-05"),
            lt: asEndOfDay("2026-03-05"),
          },
        },
      });

      expect(count).toBe(0);
    } finally {
      if (templateId) {
        await prisma.dailyTask.deleteMany({
          where: { taskTemplateId: templateId },
        });
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.user.delete({ where: { id: createdBy.id } });
    }
  });

  it("legacy recurrence fields still map to schedule_based behavior", async () => {
    const createdBy = await createTemplateCreator();
    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: `Legacy x_per_week template ${Date.now()}`,
          createdById: createdBy.id,
          isRecurring: true,
          recurrenceType: "x_per_week",
          recurrenceDays: "3",
        },
      });
      templateId = template.id;

      await assignDailyTasksForDate(asStartOfDay("2026-03-04"));
      await assignDailyTasksForDate(asStartOfDay("2026-03-04"));

      const count = await prisma.dailyTask.count({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: asStartOfDay("2026-03-04"),
            lt: asEndOfDay("2026-03-04"),
          },
        },
      });

      expect(count).toBe(1);
    } finally {
      if (templateId) {
        await prisma.dailyTask.deleteMany({
          where: { taskTemplateId: templateId },
        });
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.user.delete({ where: { id: createdBy.id } });
    }
  });
});
