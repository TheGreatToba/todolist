/**
 * @vitest-environment jsdom
 *
 * Semi-integrated tests: real AuthProvider + Login, API mocked with MSW.
 * No useAuth or login mutation mock – we assert on real flow (submit → API → redirect).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestMemoryRouter } from "@/test/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./Login";

const mockNavigate = vi.fn();

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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderLoginWithProviders() {
  const queryClient = createTestQueryClient();
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TestMemoryRouter>
          <Login />
        </TestMemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { view: within(container), queryClient };
}

describe("Login (semi-integrated with MSW)", () => {
  afterEach(() => {
    mockNavigate.mockClear();
  });

  it("on successful login (MSW returns 200), redirects to /manager", async () => {
    const { view } = renderLoginWithProviders();

    await userEvent.type(
      view.getByRole("textbox", { name: /email/i }),
      "mgr@test.com",
    );
    await userEvent.type(view.getByLabelText(/password/i), "password");
    await userEvent.click(view.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/manager", { replace: true });
    });
  });

  it("on login 401 (MSW returns Invalid credentials), shows user-visible error and does not redirect", async () => {
    const { view } = renderLoginWithProviders();

    await userEvent.type(
      view.getByRole("textbox", { name: /email/i }),
      "wrong@test.com",
    );
    await userEvent.type(view.getByLabelText(/password/i), "wrong");
    await userEvent.click(view.getByRole("button", { name: /sign in/i }));

    // Assert on the user-visible error via accessible role (UX + a11y)
    await waitFor(() => {
      expect(
        view.getByRole("alert", { name: /invalid credentials/i }),
      ).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
