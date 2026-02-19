/**
 * @vitest-environment jsdom
 */
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

  it("closes the Settings modal on Escape", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = await screen.findByRole("button", {
      name: /open team settings/i,
    });
    await userEvent.click(settingsButton);

    await screen.findByRole("dialog", { name: /team settings/i });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /team settings/i })).toBeNull();
  });

  it("locks body scroll when Settings modal is open and restores on close", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    await userEvent.click(settingsButton);

    await screen.findByRole("dialog", { name: /team settings/i });
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("restores focus to the Settings trigger button when modal is closed", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    settingsButton.focus();
    await userEvent.click(settingsButton);

    await screen.findByRole("dialog", { name: /team settings/i });

    const closeButton = await screen.findByRole("button", {
      name: /close settings modal/i,
    });
    await userEvent.click(closeButton);

    expect(document.activeElement).toBe(settingsButton);
  });

  it("traps Tab focus in Settings modal (Tab from last goes to first)", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    await userEvent.click(settingsButton);

    const dialog = await screen.findByRole("dialog", {
      name: /team settings/i,
    });
    const firstFocusable = within(dialog).getByRole("button", {
      name: /close settings modal/i,
    });
    const lastFocusable = within(dialog).getByRole("button", {
      name: /^Close$/,
    });

    lastFocusable.focus();
    expect(document.activeElement).toBe(lastFocusable);

    await userEvent.tab();
    // Focus must wrap to the first focusable (X button; dialog has tabIndex=-1 so it's not in tab order)
    expect(document.activeElement).toBe(firstFocusable);
  });

  it("traps Tab focus in Settings modal (Shift+Tab from first goes to last)", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    await userEvent.click(settingsButton);

    const dialog = await screen.findByRole("dialog", {
      name: /team settings/i,
    });
    const firstFocusable = within(dialog).getByRole("button", {
      name: /close settings modal/i,
    });
    const lastFocusable = within(dialog).getByRole("button", {
      name: /^Close$/,
    });

    firstFocusable.focus();
    expect(document.activeElement).toBe(firstFocusable);

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(lastFocusable);
  });

  it("allows focus to stay in portaled content with data-focus-trap-allow", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    await userEvent.click(settingsButton);

    await screen.findByRole("dialog", { name: /team settings/i });

    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("data-focus-trap-allow", "");
    const portalButton = document.createElement("button");
    portalButton.type = "button";
    portalButton.textContent = "Portal action";
    portalRoot.appendChild(portalButton);
    document.body.appendChild(portalRoot);

    try {
      portalButton.focus();
      expect(document.activeElement).toBe(portalButton);
    } finally {
      portalRoot.remove();
    }
  });

  it("pulls focus back into modal when focus leaves to element without data-focus-trap-allow", async () => {
    renderWithProviders(<ManagerDashboard />);

    const settingsButton = (
      await screen.findAllByRole("button", { name: /open team settings/i })
    )[0];
    await userEvent.click(settingsButton);

    const dialog = await screen.findByRole("dialog", {
      name: /team settings/i,
    });
    const firstFocusableInModal = within(dialog).getByRole("button", {
      name: /close settings modal/i,
    });

    const externalRoot = document.createElement("div");
    const externalButton = document.createElement("button");
    externalButton.type = "button";
    externalButton.textContent = "Outside";
    externalRoot.appendChild(externalButton);
    document.body.appendChild(externalRoot);

    try {
      externalButton.focus();
      expect(document.activeElement).toBe(firstFocusableInModal);
    } finally {
      externalRoot.remove();
    }
  });
});
