/**
 * @vitest-environment jsdom
 *
 * Semi-integrated test: profile 401 (session expired) → user is null, UX shows unauthenticated state.
 * Real AuthProvider + useProfileQuery; MSW returns 401 for GET /api/auth/profile.
 */
import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import { render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { server } from "@/test/mocks/server";

function AuthStatus() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <span>Loading…</span>;
  return <span>{user ? "Logged in" : "Not logged in"}</span>;
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithProviders() {
  const queryClient = createTestQueryClient();
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { view: within(container) };
}

describe("Auth profile 401 (semi-integrated with MSW)", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "warn" });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("shows loading state while GET /api/auth/profile is in flight", async () => {
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.get("*/api/auth/profile", async () => {
        await new Promise((r) => setTimeout(r, 80));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const { view } = renderWithProviders();

    expect(view.getByText(/loading/i)).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(view.getByText("Not logged in")).toBeInTheDocument();
    });
  });

  it("when GET /api/auth/profile returns 401 (session expired), user is null and UI shows unauthenticated state", async () => {
    const { view } = renderWithProviders();

    await vi.waitFor(() => {
      expect(view.getByText("Not logged in")).toBeInTheDocument();
    });
    expect(view.queryByText("Logged in")).not.toBeInTheDocument();
  });
});
