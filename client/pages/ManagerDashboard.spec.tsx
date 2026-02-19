import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    user: { id: "manager-1", role: "MANAGER" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({
    on: () => () => {},
  }),
}));

import ManagerDashboard from "./ManagerDashboard";

const mockDashboardResponse = {
  team: { name: "Test Team" },
  dailyTasks: [],
  workstations: [],
};

const mockWorkstationsResponse: unknown[] = [];
const mockTeamMembersResponse: unknown[] = [];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ManagerDashboard Settings modal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("/api/manager/dashboard")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockDashboardResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          ) as unknown as Promise<Response>;
        }

        if (url === "/api/workstations") {
          return Promise.resolve(
            new Response(JSON.stringify(mockWorkstationsResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          ) as unknown as Promise<Response>;
        }

        if (url === "/api/team/members") {
          return Promise.resolve(
            new Response(JSON.stringify(mockTeamMembersResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          ) as unknown as Promise<Response>;
        }

        return Promise.resolve(
          new Response("Not found", {
            status: 404,
          }),
        ) as unknown as Promise<Response>;
      }),
    );
  });

  it("opens and closes the Settings modal and displays the team name", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = await screen.findByRole("button", {
      name: /open team settings/i,
    });
    await userEvent.click(settingsButton);

    const dialog = await screen.findByRole("dialog", {
      name: /team settings/i,
    });
    expect(dialog).not.toBeNull();
    expect(within(dialog).getByText("Test Team")).toBeTruthy();

    const closeButton = await screen.findByRole("button", {
      name: /close settings modal/i,
    });
    await userEvent.click(closeButton);

    expect(screen.queryByRole("dialog", { name: /team settings/i })).toBeNull();
  });
});
