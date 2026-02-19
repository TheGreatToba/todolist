/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
    cleanup();
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

  it("calls PATCH /api/tasks/daily/:id with isCompleted and invalidates tasks daily prefix on success", async () => {
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
      expect(mockFetchWithCsrf).toHaveBeenCalledWith(
        "/api/tasks/daily/dt1",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ isCompleted: true }),
        }),
      );
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.tasks.dailyPrefix,
    });
  });

  it("on non-OK response does not invalidate and propagates error", async () => {
    mockFetchWithCsrf.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    );
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
      expect(mockFetchWithCsrf).toHaveBeenCalledWith(
        "/api/tasks/daily/dt1",
        expect.any(Object),
      );
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useCreateWorkstationMutation", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockFetchWithCsrf.mockResolvedValue(
      new Response(JSON.stringify({ id: "ws1", name: "New WS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    );
  });

  it("calls POST /api/workstations with name and invalidates workstations and dashboard on success", async () => {
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
      expect(mockFetchWithCsrf).toHaveBeenCalledWith(
        "/api/workstations",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ name: "New WS" }),
        }),
      );
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.manager.workstations,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.manager.dashboardPrefix,
    });
  });

  it("on non-OK response does not invalidate and propagates error", async () => {
    mockFetchWithCsrf.mockResolvedValue(
      new Response(JSON.stringify({ error: "Duplicate name" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }) as Response,
    );
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
      expect(mockFetchWithCsrf).toHaveBeenCalledWith(
        "/api/workstations",
        expect.any(Object),
      );
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
