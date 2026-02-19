/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestMemoryRouter } from "@/test/router";
import Index from "./Index";

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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/contexts/AuthContext";

const mockUseAuth = vi.mocked(useAuth);

function renderIndex() {
  const { container } = render(
    <TestMemoryRouter>
      <Index />
    </TestMemoryRouter>,
  );
  return { view: within(container), container };
}

describe("Index (Home)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      error: null,
      profileError: null,
      refetchProfile: vi.fn(),
    });
  });

  it("renders Tasty Crousty branding and hero when user is not logged in", () => {
    const { view } = renderIndex();

    expect(
      view.getByRole("heading", { name: /tasty crousty/i }),
    ).toBeInTheDocument();
    expect(
      view.getByRole("heading", {
        name: /daily task management made simple/i,
      }),
    ).toBeInTheDocument();
    expect(
      view.getByText(/empower your employees with a mobile-first checklist/i),
    ).toBeInTheDocument();
  });

  it("renders Sign in and Get started in nav when not logged in", () => {
    const { view } = renderIndex();
    const nav = view.getByRole("navigation");

    expect(
      within(nav).getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: /get started/i }),
    ).toBeInTheDocument();
  });

  it("navigates to /login when Sign in is clicked", async () => {
    const { view } = renderIndex();
    const nav = view.getByRole("navigation");

    await userEvent.click(
      within(nav).getByRole("button", { name: /sign in/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("navigates to /signup when Get started is clicked", async () => {
    const { view } = renderIndex();
    const nav = view.getByRole("navigation");

    await userEvent.click(
      within(nav).getByRole("button", { name: /get started/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });

  it("renders Key Features section", () => {
    const { view } = renderIndex();

    expect(
      view.getByRole("heading", { name: /key features/i }),
    ).toBeInTheDocument();
    expect(
      view.getByRole("heading", { name: /team management/i }),
    ).toBeInTheDocument();
    expect(view.getByText(/real-time updates/i)).toBeInTheDocument();
  });

  it("renders Navigate to /manager when user is MANAGER", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "m1", name: "Manager", email: "m@test.com", role: "MANAGER" },
      isAuthenticated: true,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      error: null,
      profileError: null,
      refetchProfile: vi.fn(),
    });

    const { view } = renderIndex();

    expect(
      view.queryByRole("heading", {
        name: /daily task management made simple/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders Navigate to /employee when user is EMPLOYEE", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "e1",
        name: "Employee",
        email: "e@test.com",
        role: "EMPLOYEE",
      },
      isAuthenticated: true,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      error: null,
      profileError: null,
      refetchProfile: vi.fn(),
    });

    const { view } = renderIndex();

    expect(
      view.queryByRole("heading", {
        name: /daily task management made simple/i,
      }),
    ).not.toBeInTheDocument();
  });
});
