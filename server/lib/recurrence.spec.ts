import { describe, it, expect } from "vitest";
import {
  getAfterCompletionConfig,
  shouldTemplateAppearOnDate,
  shouldTemplateAutoGenerate,
} from "./recurrence";

describe("recurrence helpers", () => {
  it("supports monthly schedule_based rules", () => {
    const firstOfMonth = new Date("2026-04-01T00:00:00");
    const secondOfMonth = new Date("2026-04-02T00:00:00");

    const appearsOnFirst = shouldTemplateAppearOnDate(
      {
        isRecurring: true,
        recurrenceMode: "schedule_based",
        recurrenceType: "monthly",
        recurrenceDayOfMonth: 1,
      },
      firstOfMonth,
    );
    const appearsOnSecond = shouldTemplateAppearOnDate(
      {
        isRecurring: true,
        recurrenceMode: "schedule_based",
        recurrenceType: "monthly",
        recurrenceDayOfMonth: 1,
      },
      secondOfMonth,
    );

    expect(appearsOnFirst).toBe(true);
    expect(appearsOnSecond).toBe(false);
  });

  it("manual_trigger is excluded from auto generation", () => {
    expect(
      shouldTemplateAutoGenerate({
        isRecurring: true,
        recurrenceMode: "manual_trigger",
      }),
    ).toBe(false);
  });

  it("after_completion config is read only for after_completion mode", () => {
    expect(
      getAfterCompletionConfig({
        isRecurring: true,
        recurrenceMode: "schedule_based",
        recurrenceInterval: 3,
        recurrenceIntervalUnit: "day",
      }),
    ).toBeNull();

    expect(
      getAfterCompletionConfig({
        isRecurring: true,
        recurrenceMode: "after_completion",
        recurrenceInterval: 3,
        recurrenceIntervalUnit: "day",
      }),
    ).toEqual({
      interval: 3,
      intervalUnit: "day",
    });
  });
});
