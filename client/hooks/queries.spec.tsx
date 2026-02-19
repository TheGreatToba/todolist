import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  queryKeys,
  useUpdateDailyTaskMutation,
  useCreateWorkstationMutation,
} from "./queries";
import { fetchWithCsrf } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchWithCsrf: vi.fn(),
}));

const mockFetchWithCsrf = vi.mocked(fetchWithCsrf);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidateSpy, wrapper };
}

describe("useUpdateDailyTaskMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithCsrf.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "dt1",
          taskTemplateId: "tt1",
          employeeId: "e1",
          date: "2025-02-19",
          isCompleted: true,
          taskTemplate: { id: "tt1", title: "Task" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as Response,
    );
  });

  it("invalidates tasks daily prefix on success", async () => {
    const { invalidateSpy, wrapper } = createWrapper();

    function ToggleTaskTest() {
      const mutation = useUpdateDailyTaskMutation();
      return (
        <button
          onClick={() => mutation.mutate({ taskId: "dt1", isCompleted: true })}
        >
          Toggle
        </button>
      );
    }

    render(<ToggleTaskTest />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /toggle/i }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.tasks.dailyPrefix,
      });
    });
  });
});

describe("useCreateWorkstationMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithCsrf.mockResolvedValue(
      new Response(JSON.stringify({ id: "ws1", name: "New WS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    );
  });

  it("invalidates workstations and manager dashboard prefix on success", async () => {
    const { invalidateSpy, wrapper } = createWrapper();

    function CreateWorkstationTest() {
      const mutation = useCreateWorkstationMutation();
      return (
        <button onClick={() => mutation.mutate({ name: "New WS" })}>
          Create
        </button>
      );
    }

    render(<CreateWorkstationTest />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.manager.workstations,
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
    });
  });
});
