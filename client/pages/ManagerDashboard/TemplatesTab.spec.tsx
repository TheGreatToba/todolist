/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplatesTab } from "./TemplatesTab";
import type { TaskTemplateWithRelations } from "@shared/api";

const templates: TaskTemplateWithRelations[] = [
  {
    id: "tt-rec",
    title: "Opening checklist",
    description: "Open station",
    workstationId: "ws-1",
    assignedToEmployeeId: null,
    isRecurring: true,
    notifyEmployee: true,
    createdAt: "2025-02-19T00:00:00.000Z",
    updatedAt: "2025-02-19T00:00:00.000Z",
    workstation: { id: "ws-1", name: "Front Desk" },
    assignedToEmployee: null,
  },
  {
    id: "tt-one",
    title: "Deep cleaning",
    description: "One-off cleanup",
    workstationId: null,
    assignedToEmployeeId: "emp-1",
    isRecurring: false,
    notifyEmployee: true,
    createdAt: "2025-02-19T00:00:00.000Z",
    updatedAt: "2025-02-19T00:00:00.000Z",
    workstation: null,
    assignedToEmployee: {
      id: "emp-1",
      name: "Alice",
      email: "alice@test.com",
    },
  },
];

function renderTemplatesTab(data: TaskTemplateWithRelations[] = templates) {
  return render(
    <TemplatesTab
      templates={data}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onCreateTemplate={vi.fn()}
    />,
  );
}

describe("TemplatesTab recurring vs one-shot segmented UX", () => {
  it("shows segmented labels with counts", () => {
    renderTemplatesTab();

    expect(
      screen.getByRole("button", { name: "Récurrentes (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "One-shot (1)" }),
    ).toBeInTheDocument();
  });

  it("defaults to recurring list and switches to one-shot list", async () => {
    renderTemplatesTab();

    expect(screen.getByText("Opening checklist")).toBeInTheDocument();
    expect(screen.queryByText("Deep cleaning")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "One-shot (1)" }));

    expect(screen.getByText("Deep cleaning")).toBeInTheDocument();
    expect(screen.queryByText("Opening checklist")).not.toBeInTheDocument();
  });

  it("shows dedicated empty state message for one-shot tab", async () => {
    const recurringOnly = templates.filter((template) => template.isRecurring);
    renderTemplatesTab(recurringOnly);

    await userEvent.click(screen.getByRole("button", { name: "One-shot (0)" }));

    expect(screen.getByText("Aucune tâche one-shot.")).toBeInTheDocument();
  });
});
