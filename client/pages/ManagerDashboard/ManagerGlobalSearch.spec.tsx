/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManagerGlobalSearch } from "./ManagerGlobalSearch";
import type {
  ManagerDashboard as ManagerDashboardType,
  TaskTemplateWithRelations,
  TeamMember,
} from "@shared/api";
import type { WorkstationWithEmployees } from "@/hooks/queries";

// Lightweight ResizeObserver + scrollIntoView polyfills for jsdom/Vitest
const globalWithResizeObserver = globalThis as typeof globalThis & {
  ResizeObserver?: {
    new (callback: ResizeObserverCallback): ResizeObserver;
  };
};

if (!globalWithResizeObserver.ResizeObserver) {
  globalWithResizeObserver.ResizeObserver = class ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      void callback;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (!HTMLElement.prototype.scrollIntoView) {
  // jsdom does not implement scrollIntoView; provide a no-op
  HTMLElement.prototype.scrollIntoView = function scrollIntoView(): void {
    return;
  };
}

const employees: TeamMember[] = [
  {
    id: "emp-1",
    name: "Alice",
    email: "alice@test.com",
    workstations: [],
  },
];

const workstations: WorkstationWithEmployees[] = [
  {
    id: "ws-1",
    name: "Front Desk",
    employees: [],
  },
];

const templates: TaskTemplateWithRelations[] = [
  {
    id: "tmpl-1",
    title: "Opening checklist",
    description: "Open station",
    workstationId: "ws-1",
    assignedToEmployeeId: "emp-1",
    isRecurring: true,
    notifyEmployee: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    workstation: { id: "ws-1", name: "Front Desk" },
    assignedToEmployee: {
      id: "emp-1",
      name: "Alice",
      email: "alice@test.com",
    },
  },
];

const dashboard: ManagerDashboardType = {
  team: {
    id: "team-1",
    name: "Team 1",
    members: employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
    })),
  },
  date: "2026-03-03",
  dailyTasks: [
    {
      id: "task-1",
      taskTemplateId: "tmpl-1",
      employeeId: "emp-1",
      date: "2026-03-03T00:00:00.000Z",
      status: "ASSIGNED",
      isCompleted: false,
      completedAt: null,
      taskTemplate: {
        id: "tmpl-1",
        title: "Opening checklist",
        description: "Open station",
        isRecurring: true,
        workstation: { id: "ws-1", name: "Front Desk" },
      },
      employee: {
        id: "emp-1",
        name: "Alice",
        email: "alice@test.com",
      },
    },
  ],
  workstations: [{ id: "ws-1", name: "Front Desk" }],
  dayPreparation: {
    recurringTemplatesTotal: 1,
    recurringUnassignedCount: 0,
    isPrepared: true,
    preparedAt: null,
    unassignedRecurringTemplates: [],
  },
};

describe("ManagerGlobalSearch", () => {
  it("calls selection callbacks and closes when an item is selected", async () => {
    const onOpenChange = vi.fn();
    const onSelectEmployee = vi.fn();
    const onSelectWorkstation = vi.fn();
    const onSelectTemplate = vi.fn();
    const onSelectTask = vi.fn();

    render(
      <ManagerGlobalSearch
        open
        onOpenChange={onOpenChange}
        employees={employees}
        workstations={workstations}
        templates={templates}
        dashboard={dashboard}
        onSelectEmployee={onSelectEmployee}
        onSelectWorkstation={onSelectWorkstation}
        onSelectTemplate={onSelectTemplate}
        onSelectTask={onSelectTask}
      />,
    );

    const [employeeItem] = screen.getAllByRole("option", { name: /alice/i });
    await userEvent.click(employeeItem);
    expect(onSelectEmployee).toHaveBeenCalledWith("emp-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
