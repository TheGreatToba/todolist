/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestMemoryRouter } from "@/test/router";
import NotFound from "./NotFound";

const mockNavigate = vi.fn();

// Silence logger.warn() calls from NotFound component during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/unknown-page" }),
  };
});

function renderNotFound() {
  const { container } = render(
    <TestMemoryRouter>
      <NotFound />
    </TestMemoryRouter>,
  );
  return { view: within(container) };
}

describe("NotFound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 404 heading and message", () => {
    const { view } = renderNotFound();

    expect(view.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(
      view.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
    expect(
      view.getByText(/the page you're looking for doesn't exist/i),
    ).toBeInTheDocument();
  });

  it("navigates to home when Return to Home is clicked", async () => {
    const { view } = renderNotFound();

    await userEvent.click(
      view.getByRole("button", { name: /return to home/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
