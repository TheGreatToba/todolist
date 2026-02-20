/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TasksTab } from "./TasksTab";
import type { ManagerDashboard, TeamMember } from "@shared/api";

const teamMembers: TeamMember[] = [
  {
    id: "emp-1",
    name: "Alice",
    email: "alice@test.com",
    workstations: [],
  },
];

const dashboard: ManagerDashboard = {
  team: {
    id: "team-1",
    name: "Team",
    members: [],
  },
  date: "2025-02-19",
  workstations: [{ id: "ws-1", name: "Front Desk" }],
  dailyTasks: [
    {
      id: "dt-rec",
      taskTemplateId: "tt-rec",
      employeeId: "emp-1",
      date: "2025-02-19T00:00:00.000Z",
      isCompleted: false,
      taskTemplate: {
        id: "tt-rec",
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
    {
      id: "dt-one",
      taskTemplateId: "tt-one",
      employeeId: "emp-1",
      date: "2025-02-19T00:00:00.000Z",
      isCompleted: false,
      taskTemplate: {
        id: "tt-one",
        title: "Deep cleaning",
        description: "One-off cleanup",
        isRecurring: false,
        workstation: { id: "ws-1", name: "Front Desk" },
      },
      employee: {
        id: "emp-1",
        name: "Alice",
        email: "alice@test.com",
      },
    },
  ],
};

function renderTasksTab(withDashboard: ManagerDashboard = dashboard) {
  return render(
    <TasksTab
      dashboard={withDashboard}
      teamMembers={teamMembers}
      selectedDate="2025-02-19"
      setSelectedDate={vi.fn()}
      selectedEmployee={null}
      setSelectedEmployee={vi.fn()}
      selectedWorkstation={null}
      setSelectedWorkstation={vi.fn()}
      onExportCsv={vi.fn()}
      onNewTask={vi.fn()}
      onToggleTask={vi.fn()}
      onReassignTask={vi.fn()}
      isTaskUpdating={false}
      pendingTaskId={null}
    />,
  );
}

describe("TasksTab recurring vs one-shot segmented UX", () => {
  it("shows segmented labels with counts", () => {
    renderTasksTab();

    expect(
      screen.getByRole("button", { name: "Récurrentes (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "One-shot (1)" }),
    ).toBeInTheDocument();
  });

  it("defaults to recurring list and switches to one-shot list", async () => {
    renderTasksTab();

    expect(screen.getByText("Opening checklist")).toBeInTheDocument();
    expect(screen.queryByText("Deep cleaning")).not.toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "One-shot (1)" }));

    expect(screen.getByText("Deep cleaning")).toBeInTheDocument();
    expect(screen.queryByText("Opening checklist")).not.toBeInTheDocument();
    expect(screen.getByText("One-shot")).toBeInTheDocument();
  });

  it("shows dedicated empty state message for one-shot tab", async () => {
    const recurringOnly: ManagerDashboard = {
      ...dashboard,
      dailyTasks: dashboard.dailyTasks.filter(
        (task) => task.taskTemplate.isRecurring,
      ),
    };
    renderTasksTab(recurringOnly);

    await userEvent.click(screen.getByRole("button", { name: "One-shot (0)" }));

    expect(
      screen.getByText("Aucune tâche one-shot pour ces filtres."),
    ).toBeInTheDocument();
  });
});
