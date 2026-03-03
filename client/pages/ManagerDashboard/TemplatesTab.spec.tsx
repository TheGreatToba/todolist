/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplatesTab } from "./TemplatesTab";
import type { TaskTemplateWithRelations, TeamMember } from "@shared/api";
import type { WorkstationWithEmployees } from "@/hooks/queries";

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
  {
    id: "tt-one-2",
    title: "Inventory check",
    description: "End-of-day inventory",
    workstationId: null,
    assignedToEmployeeId: "emp-2",
    isRecurring: false,
    notifyEmployee: false,
    createdAt: "2025-02-19T00:00:00.000Z",
    updatedAt: "2025-02-19T00:00:00.000Z",
    workstation: null,
    assignedToEmployee: {
      id: "emp-2",
      name: "Bob",
      email: "bob@test.com",
    },
  },
];

const teamMembers: TeamMember[] = [
  {
    id: "emp-1",
    name: "Alice",
    email: "alice@test.com",
    workstations: [{ id: "ws-1", name: "Front Desk" }],
  },
  {
    id: "emp-2",
    name: "Bob",
    email: "bob@test.com",
    workstations: [],
  },
];

const workstations: WorkstationWithEmployees[] = [
  {
    id: "ws-1",
    name: "Front Desk",
    employees: [
      {
        employee: { id: "emp-1", name: "Alice", email: "alice@test.com" },
      },
    ],
  },
  {
    id: "ws-2",
    name: "Back Office",
    employees: [],
  },
];

type TemplatesTabProps = React.ComponentProps<typeof TemplatesTab>;

function renderTemplatesTab(
  overrides?: Partial<TemplatesTabProps> & {
    templatesOverride?: TaskTemplateWithRelations[];
  },
) {
  const { templatesOverride, ...rest } = overrides ?? {};
  const defaultProps: TemplatesTabProps = {
    templates: templatesOverride ?? templates,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCreateTemplate: vi.fn(),
    teamMembers,
    workstations,
    onBatchUpdateTemplates: vi.fn(),
    isBatchUpdatingTemplates: false,
  };

  return render(<TemplatesTab {...defaultProps} {...rest} />);
}

describe("TemplatesTab recurring vs one-shot segmented UX", () => {
  it("shows segmented labels with counts", () => {
    renderTemplatesTab();

    expect(
      screen.getByRole("button", { name: "Récurrentes (1)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "One-shot (2)" }),
    ).toBeInTheDocument();
  });

  it("defaults to recurring list and switches to one-shot list", async () => {
    renderTemplatesTab();

    expect(screen.getByText("Opening checklist")).toBeInTheDocument();
    expect(screen.queryByText("Deep cleaning")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "One-shot (2)" }));

    expect(screen.getByText("Deep cleaning")).toBeInTheDocument();
    expect(screen.queryByText("Opening checklist")).not.toBeInTheDocument();
  });

  it("shows dedicated empty state message for one-shot tab", async () => {
    const recurringOnly = templates.filter((template) => template.isRecurring);
    renderTemplatesTab({ templatesOverride: recurringOnly });

    await userEvent.click(screen.getByRole("button", { name: "One-shot (0)" }));

    expect(screen.getByText("Aucune tâche one-shot.")).toBeInTheDocument();
  });
});

describe("TemplatesTab batch assignment UX", () => {
  it("allows selecting multiple templates and assigning them to an employee", async () => {
    const onBatchUpdateTemplates = vi.fn();
    renderTemplatesTab({ onBatchUpdateTemplates });

    await userEvent.click(screen.getByRole("button", { name: "One-shot (2)" }));

    await userEvent.click(
      screen.getByLabelText("Select template Deep cleaning"),
    );
    await userEvent.click(
      screen.getByLabelText("Select template Inventory check"),
    );

    expect(
      screen.getByText("2 templates selected", { exact: false }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Select employee for batch template assignment"),
      "emp-1",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Assign to employee" }),
    );

    expect(onBatchUpdateTemplates).toHaveBeenCalledWith({
      templateIds: ["tt-one", "tt-one-2"],
      action: "assignToEmployee",
      employeeId: "emp-1",
    });
  });

  it("disables batch controls while batch update is pending", async () => {
    renderTemplatesTab({ isBatchUpdatingTemplates: true });

    await userEvent.click(
      screen.getByLabelText("Select template Opening checklist"),
    );

    const employeeSelect = screen.getByLabelText(
      "Select employee for batch template assignment",
    ) as HTMLSelectElement;
    const workstationSelect = screen.getByLabelText(
      "Select workstation for batch template assignment",
    ) as HTMLSelectElement;

    expect(employeeSelect.disabled).toBe(true);
    expect(workstationSelect.disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "Assign to employee" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Assign to workstation" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Clear assignment" }),
    ).toBeDisabled();
  });

  it("resets selection and batch controls when templates data changes", async () => {
    const { rerender } = renderTemplatesTab();

    await userEvent.click(screen.getByRole("button", { name: "One-shot (2)" }));

    await userEvent.click(
      screen.getByLabelText("Select template Deep cleaning"),
    );
    await userEvent.click(
      screen.getByLabelText("Select template Inventory check"),
    );

    expect(
      screen.getByText("2 templates selected", { exact: false }),
    ).toBeInTheDocument();

    rerender(
      <TemplatesTab
        templates={[...templates]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCreateTemplate={vi.fn()}
        teamMembers={teamMembers}
        workstations={workstations}
      />,
    );

    expect(
      screen.queryByText("templates selected", { exact: false }),
    ).not.toBeInTheDocument();
  });
});
