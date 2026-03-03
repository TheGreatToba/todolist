/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TasksTab } from "./TasksTab";
import type {
  ManagerDashboard as ManagerDashboardType,
  TeamMember,
} from "@shared/api";

const teamMembers: TeamMember[] = [
  {
    id: "emp-1",
    name: "Alice",
    email: "alice@test.com",
    workstations: [],
  },
  {
    id: "emp-2",
    name: "Bob",
    email: "bob@test.com",
    workstations: [],
  },
];

const baseDashboard: ManagerDashboardType = {
  team: {
    id: "team-1",
    name: "Team 1",
    members: teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
    })),
  },
  date: "2026-02-23",
  dailyTasks: [
    {
      id: "task-1",
      taskTemplateId: "tmpl-1",
      employeeId: "emp-1",
      date: "2026-02-23T00:00:00.000Z",
      status: "ASSIGNED",
      isCompleted: false,
      completedAt: null,
      taskTemplate: {
        id: "tmpl-1",
        title: "Task A",
        description: "First task",
        isRecurring: true,
        workstation: {
          id: "ws-1",
          name: "Front Desk",
        },
      },
      employee: {
        id: "emp-1",
        name: "Alice",
        email: "alice@test.com",
      },
    },
    {
      id: "task-2",
      taskTemplateId: "tmpl-2",
      employeeId: "emp-2",
      date: "2026-02-23T00:00:00.000Z",
      status: "ASSIGNED",
      isCompleted: false,
      completedAt: null,
      taskTemplate: {
        id: "tmpl-2",
        title: "Task B",
        description: "Second task",
        isRecurring: false,
        workstation: {
          id: "ws-1",
          name: "Front Desk",
        },
      },
      employee: {
        id: "emp-2",
        name: "Bob",
        email: "bob@test.com",
      },
    },
  ],
  workstations: [
    {
      id: "ws-1",
      name: "Front Desk",
    },
  ],
  dayPreparation: {
    recurringTemplatesTotal: 0,
    recurringUnassignedCount: 0,
    isPrepared: true,
    preparedAt: null,
    unassignedRecurringTemplates: [],
  },
};

type TasksTabProps = React.ComponentProps<typeof TasksTab>;

function buildBaseProps(
  dashboardOverride?: ManagerDashboardType,
): TasksTabProps {
  return {
    dashboard: dashboardOverride ?? baseDashboard,
    teamMembers,
    selectedDate: "2026-02-23",
    setSelectedDate: vi.fn(),
    selectedEmployee: null,
    setSelectedEmployee: vi.fn(),
    selectedWorkstation: null,
    setSelectedWorkstation: vi.fn(),
    onExportCsv: vi.fn(),
    onNewTask: vi.fn(),
    onToggleTask: vi.fn(),
    onReassignTask: vi.fn(),
    onPrepareAssign: vi.fn(),
    isPrepareAssigning: false,
    pendingTaskId: null,
    isTaskUpdating: false,
    onBatchAssignTasks: vi.fn(),
    onBatchUnassignTasks: vi.fn(),
    isBatchUpdatingTasks: false,
  };
}

describe("TasksTab batch selection UX", () => {
  it("keeps selection when dashboard data changes but filters stay the same", async () => {
    const baseProps = buildBaseProps();
    const { rerender } = render(<TasksTab {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /select multiple/i }),
    );

    await userEvent.click(screen.getByLabelText("Select task Task A"));
    await userEvent.click(screen.getByLabelText("Select task Task B"));

    expect(
      screen.getByText("2 tasks selected", { exact: false }),
    ).toBeInTheDocument();

    const updatedDashboard: ManagerDashboardType = {
      ...baseDashboard,
      dailyTasks: [
        ...baseDashboard.dailyTasks,
        {
          ...baseDashboard.dailyTasks[0],
          id: "task-3",
          taskTemplate: {
            ...baseDashboard.dailyTasks[0].taskTemplate,
            id: "tmpl-3",
            title: "Task C",
          },
        },
      ],
    };

    rerender(<TasksTab {...baseProps} dashboard={updatedDashboard} />);

    expect(
      screen.getByText("2 tasks selected", { exact: false }),
    ).toBeInTheDocument();
  });

  it("resets selection when strong filters (date) change", async () => {
    const baseProps = buildBaseProps();
    const { rerender } = render(<TasksTab {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /select multiple/i }),
    );

    await userEvent.click(screen.getByLabelText("Select task Task A"));
    await userEvent.click(screen.getByLabelText("Select task Task B"));

    expect(
      screen.getByText("2 tasks selected", { exact: false }),
    ).toBeInTheDocument();

    rerender(<TasksTab {...baseProps} selectedDate="2026-02-24" />);

    expect(
      screen.queryByText("tasks selected", { exact: false }),
    ).not.toBeInTheDocument();
  });
});
