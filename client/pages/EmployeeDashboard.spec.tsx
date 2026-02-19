/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeDashboard from "./EmployeeDashboard";

const mockLogout = vi.fn();
const mockOn = vi.fn(() => () => {});

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "emp-1", name: "Test Employee", email: "e@test.com" },
    logout: mockLogout,
  }),
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ on: mockOn }),
}));

vi.mock("@/lib/date-utils", () => ({
  todayLocalISO: () => "2025-02-19",
  isToday: (dateStr: string) => dateStr === "2025-02-19",
  formatTaskDateLabel: (dateStr: string) =>
    dateStr === "2025-02-19" ? "Today's Tasks" : `${dateStr} - Tasks`,
}));

const mockTasks: Array<{
  id: string;
  isCompleted: boolean;
  completedAt: string | null;
  taskTemplate: {
    title: string;
    description: string | null;
    workstation: { name: string } | null;
  };
}> = [
  {
    id: "dt1",
    isCompleted: false,
    completedAt: null,
    taskTemplate: {
      title: "Morning checklist",
      description: "Complete opening duties",
      workstation: { name: "Front Desk" },
    },
  },
  {
    id: "dt2",
    isCompleted: true,
    completedAt: "2025-02-19T10:00:00Z",
    taskTemplate: {
      title: "Stock inventory",
      description: null,
      workstation: { name: "Warehouse" },
    },
  },
];

const mockMutateAsync = vi.fn();

vi.mock("@/hooks/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/queries")>();
  return {
    ...actual,
    useDailyTasksQuery: (_date: string) => {
      void _date;
      return {
        data: mockTasks,
        isLoading: false,
      };
    },
    useUpdateDailyTaskMutation: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
      variables: null,
    }),
  };
});

/**
 * Fresh QueryClient per render: retry disabled to avoid async flakes,
 * no shared cache between tests.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  const { container } = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { view: within(container), queryClient };
}

describe("EmployeeDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it("renders welcome message and user name", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByText(/welcome, test employee/i)).toBeInTheDocument();
  });

  it("renders date picker with Select date label", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByLabelText(/select date/i)).toBeInTheDocument();
  });

  it("renders progress section with completed and total count", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByText(/50%/)).toBeInTheDocument();
    expect(view.getByText(/\/2/)).toBeInTheDocument();
  });

  it("renders task list with template titles", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByText("Morning checklist")).toBeInTheDocument();
    expect(view.getByText("Stock inventory")).toBeInTheDocument();
  });

  it("calls update mutation when task toggle is clicked", async () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    const firstTaskRow = view
      .getByText("Morning checklist")
      .closest("div[class*='gap-4']");
    const toggle = firstTaskRow?.querySelector("button");
    expect(toggle).toBeInTheDocument();
    await userEvent.click(toggle!);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      taskId: "dt1",
      isCompleted: true,
    });
  });

  it("renders logout button", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows Today's Progress when date is today", () => {
    const { view } = renderWithProviders(<EmployeeDashboard />);

    expect(view.getByText(/today's progress/i)).toBeInTheDocument();
  });
});
