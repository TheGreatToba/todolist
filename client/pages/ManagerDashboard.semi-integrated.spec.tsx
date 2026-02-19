/**
 * @vitest-environment jsdom
 *
 * Semi-integrated test: real ManagerDashboard + real query hooks, API mocked with MSW.
 * No fetch mock – useManagerDashboardQuery (and workstations, team members) hit MSW.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ManagerDashboard from "./ManagerDashboard";

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
    user: { id: "m1", name: "Manager", email: "mgr@test.com", role: "MANAGER" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ on: () => () => {} }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderDashboardWithProviders() {
  const queryClient = createTestQueryClient();
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ManagerDashboard />
    </QueryClientProvider>,
  );
  return { view: within(container), queryClient };
}

describe("ManagerDashboard (semi-integrated with MSW)", () => {
  it("displays team name from GET /api/manager/dashboard (MSW response)", async () => {
    const { view } = renderDashboardWithProviders();

    await waitFor(() => {
      expect(view.getByText("MSW Team")).toBeInTheDocument();
    });
  });
});
