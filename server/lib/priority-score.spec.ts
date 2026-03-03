import { describe, it, expect } from "vitest";
import {
  computeTaskPriorityScore,
  type TaskForPriority,
} from "./priority-score";

function dateAt(hoursOffsetFromStart: number, start: Date): Date {
  return new Date(start.getTime() + hoursOffsetFromStart * 60 * 60 * 1000);
}

describe("computeTaskPriorityScore", () => {
  const refStart = new Date("2025-03-03T00:00:00.000Z");
  const refEnd = new Date("2025-03-04T00:00:00.000Z");

  it("returns 10 for completed tasks", () => {
    expect(
      computeTaskPriorityScore(
        {
          date: refStart,
          isCompleted: true,
          employeeId: "e1",
        },
        refStart,
        refEnd,
      ),
    ).toBe(10);
    expect(
      computeTaskPriorityScore(
        {
          date: new Date("2025-03-01T00:00:00.000Z"),
          isCompleted: true,
          employeeId: null,
        },
        refStart,
        refEnd,
      ),
    ).toBe(10);
  });

  it("returns 100-120 for overdue tasks (higher when more overdue)", () => {
    const oneHourAgo = dateAt(-1, refStart);
    const task: TaskForPriority = {
      date: oneHourAgo,
      isCompleted: false,
      employeeId: "e1",
    };
    expect(computeTaskPriorityScore(task, refStart, refEnd)).toBe(101);

    const twoDaysAgo = new Date(refStart.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(
      computeTaskPriorityScore({ ...task, date: twoDaysAgo }, refStart, refEnd),
    ).toBe(120); // cap at 20 bonus
  });

  it("returns 80 for unassigned due today", () => {
    expect(
      computeTaskPriorityScore(
        {
          date: refStart,
          isCompleted: false,
          employeeId: null,
        },
        refStart,
        refEnd,
      ),
    ).toBe(80);
  });

  it("returns 50 for assigned due today", () => {
    expect(
      computeTaskPriorityScore(
        {
          date: refStart,
          isCompleted: false,
          employeeId: "e1",
        },
        refStart,
        refEnd,
      ),
    ).toBe(50);
  });

  it("returns 30 for future tasks", () => {
    const tomorrow = new Date(refEnd.getTime() + 60 * 60 * 1000);
    expect(
      computeTaskPriorityScore(
        {
          date: tomorrow,
          isCompleted: false,
          employeeId: "e1",
        },
        refStart,
        refEnd,
      ),
    ).toBe(30);
  });
});
