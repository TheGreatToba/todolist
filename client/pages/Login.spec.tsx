/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

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

function renderLogin() {
  const { container } = render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  return { view: within(container) };
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      login: mockLogin,
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      error: null,
      isAuthenticated: false,
      profileError: null,
      refetchProfile: vi.fn(),
    });
  });

  it("renders TaskFlow title and login form", () => {
    const { view } = renderLogin();

    expect(
      view.getByRole("heading", { name: /taskflow/i }),
    ).toBeInTheDocument();
    expect(view.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(view.getByLabelText(/password/i)).toBeInTheDocument();
    expect(view.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation message when submitting with empty fields", async () => {
    const { view } = renderLogin();

    await userEvent.click(view.getByRole("button", { name: /sign in/i }));

    expect(view.getByText(/please fill in all fields/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login with email and password when form is valid", async () => {
    mockLogin.mockResolvedValue(undefined);
    const { view } = renderLogin();

    await userEvent.type(
      view.getByRole("textbox", { name: /email/i }),
      "user@test.com",
    );
    await userEvent.type(view.getByLabelText(/password/i), "secret");
    await userEvent.click(view.getByRole("button", { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith("user@test.com", "secret");
  });

  it("navigates to signup when Create one is clicked", async () => {
    const { view } = renderLogin();

    await userEvent.click(view.getByRole("button", { name: /create one/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/signup");
  });

  it("displays demo credentials info", () => {
    const { view } = renderLogin();

    expect(view.getByText(/demo credentials/i)).toBeInTheDocument();
    expect(view.getByText(/emp@test.com/i)).toBeInTheDocument();
    expect(view.getByText(/mgr@test.com/i)).toBeInTheDocument();
  });

  it("disables submit and shows loading state when isLoading is true", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      login: mockLogin,
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: true,
      error: null,
      isAuthenticated: false,
      profileError: null,
      refetchProfile: vi.fn(),
    });

    const { view } = renderLogin();

    expect(view.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("displays context error when useAuth provides error", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      login: mockLogin,
      signup: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      error: "Invalid credentials",
      isAuthenticated: false,
      profileError: null,
      refetchProfile: vi.fn(),
    });

    const { view } = renderLogin();

    expect(
      view.getByRole("alert", { name: /invalid credentials/i }),
    ).toBeInTheDocument();
  });
});
