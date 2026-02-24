/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestMemoryRouter } from "@/test/router";
import TodayBoard from "./TodayBoard";

const mockNavigate = vi.fn();
const mockMutateCreateTask = vi.fn();
const mockMutateUpdateTask = vi.fn();
const mockLogout = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/queries", () => ({
  useManagerTodayBoardQuery: vi.fn(),
  useTeamMembersQuery: vi.fn(),
  useUpdateDailyTaskMutation: vi.fn(),
  useCreateTodayBoardTaskMutation: vi.fn(),
}));

import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerTodayBoardQuery,
  useTeamMembersQuery,
  useUpdateDailyTaskMutation,
  useCreateTodayBoardTaskMutation,
} from "@/hooks/queries";

const mockUseAuth = vi.mocked(useAuth);
const mockUseManagerTodayBoardQuery = vi.mocked(useManagerTodayBoardQuery);
const mockUseTeamMembersQuery = vi.mocked(useTeamMembersQuery);
const mockUseUpdateDailyTaskMutation = vi.mocked(useUpdateDailyTaskMutation);
const mockUseCreateTodayBoardTaskMutation = vi.mocked(
  useCreateTodayBoardTaskMutation,
);

function renderTodayBoard() {
  const { container } = render(
    <TestMemoryRouter>
      <TodayBoard />
    </TestMemoryRouter>,
  );
  return { view: within(container) };
}

describe("TodayBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "m1",
        name: "Manager",
        email: "mgr@test.com",
        role: "MANAGER",
      },
      logout: mockLogout,
      login: vi.fn(),
      signup: vi.fn(),
      isLoading: false,
      error: null,
      isAuthenticated: true,
      profileError: null,
      refetchProfile: vi.fn(),
    });
    mockUseManagerTodayBoardQuery.mockReturnValue({
      data: {
        date: "2025-02-24",
        overdue: [],
        today: [
          {
            id: "task-1",
            taskTemplateId: null,
            employeeId: null,
            date: "2025-02-24T00:00:00.000Z",
            status: "UNASSIGNED",
            isCompleted: false,
            completedAt: null,
            taskTemplate: {
              id: "task-1",
              title: "Check fryer oil",
              isRecurring: false,
            },
          },
        ],
        completedToday: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useManagerTodayBoardQuery>);
    mockUseTeamMembersQuery.mockReturnValue({
      data: [
        {
          id: "emp-1",
          name: "Alice",
          email: "alice@test.com",
          workstations: [],
        },
      ],
    } as unknown as ReturnType<typeof useTeamMembersQuery>);
    mockUseUpdateDailyTaskMutation.mockReturnValue({
      mutateAsync: mockMutateUpdateTask,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useUpdateDailyTaskMutation>);
    mockUseCreateTodayBoardTaskMutation.mockReturnValue({
      mutateAsync: mockMutateCreateTask,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateTodayBoardTaskMutation>);

    mockMutateCreateTask.mockResolvedValue({});
    mockMutateUpdateTask.mockResolvedValue({});
  });

  it("defaults quick-create due date to board date", async () => {
    const { view } = renderTodayBoard();

    const dueDateInput = view.getByLabelText(/due date/i) as HTMLInputElement;
    expect(dueDateInput.value).toBe("2025-02-24");

    await userEvent.type(view.getByLabelText(/task title/i), "Restock sauces");
    await userEvent.click(view.getByRole("button", { name: /\+ new task/i }));

    expect(mockMutateCreateTask).toHaveBeenCalledWith({
      title: "Restock sauces",
      dueDate: "2025-02-24",
      assignedToEmployeeId: undefined,
    });
  });

  it("toggles task completion from today section", async () => {
    const { view } = renderTodayBoard();

    await userEvent.click(
      view.getByRole("button", { name: /mark task check fryer oil as done/i }),
    );

    expect(mockMutateUpdateTask).toHaveBeenCalledWith({
      taskId: "task-1",
      isCompleted: true,
    });
  });
});
