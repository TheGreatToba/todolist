/**
 * @vitest-environment jsdom
 *
 * Semi-integrated test: ManagerLayout + ManagerDashboard, API mocked with MSW.
 * Team name is shown in the layout header from GET /api/manager/dashboard.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ManagerLayout from "./ManagerLayout";
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

function renderManagerWithProviders() {
  const queryClient = createTestQueryClient();
  const { container } = render(
    <MemoryRouter initialEntries={["/manager/dashboard"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/manager" element={<ManagerLayout />}>
            <Route path="dashboard" element={<ManagerDashboard />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { view: within(container), queryClient };
}

describe("ManagerDashboard (semi-integrated with MSW)", () => {
  it("displays team name from GET /api/manager/dashboard (MSW response)", async () => {
    const { view } = renderManagerWithProviders();

    await waitFor(() => {
      expect(view.getByText("MSW Team")).toBeInTheDocument();
    });
  });
});
