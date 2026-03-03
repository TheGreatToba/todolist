import * as React from "react";
import type {
  ManagerDashboard as ManagerDashboardType,
  TaskTemplateWithRelations,
  TeamMember,
} from "@shared/api";
import type { WorkstationWithEmployees } from "@/hooks/queries";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { DIRECT_ASSIGNMENTS_ID } from "./types";

type ManagerGlobalSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: TeamMember[];
  workstations: WorkstationWithEmployees[];
  templates: TaskTemplateWithRelations[];
  dashboard: ManagerDashboardType;
  onSelectEmployee: (employeeId: string) => void;
  onSelectWorkstation: (workstationId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onSelectTask: (taskId: string) => void;
};

export function ManagerGlobalSearch({
  open,
  onOpenChange,
  employees,
  workstations,
  templates,
  dashboard,
  onSelectEmployee,
  onSelectWorkstation,
  onSelectTemplate,
  onSelectTask,
}: ManagerGlobalSearchProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const sortedEmployees = React.useMemo(
    () =>
      [...employees].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [employees],
  );

  const sortedWorkstations = React.useMemo(
    () =>
      [...workstations].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [workstations],
  );

  const sortedTemplates = React.useMemo(
    () =>
      [...templates].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    [templates],
  );

  const tasks = dashboard.dailyTasks;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput placeholder="Rechercher des employes, postes, modeles, taches..." />
      <CommandList>
        <CommandEmpty>Aucun resultat.</CommandEmpty>

        {sortedEmployees.length > 0 && (
          <CommandGroup heading="Employes">
            {sortedEmployees.map((employee) => (
              <CommandItem
                key={employee.id}
                value={`employee ${employee.name} ${employee.email}`}
                onSelect={() => {
                  onSelectEmployee(employee.id);
                  onOpenChange(false);
                }}
              >
                <span className="font-medium">{employee.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {employee.email}
                </span>
                <CommandShortcut>Employe</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {sortedWorkstations.length > 0 && (
          <CommandGroup heading="Postes">
            {sortedWorkstations.map((ws) => (
              <CommandItem
                key={ws.id}
                value={`workstation ${ws.name}`}
                onSelect={() => {
                  onSelectWorkstation(ws.id);
                  onOpenChange(false);
                }}
              >
                <span className="font-medium">{ws.name}</span>
                <CommandShortcut>Poste</CommandShortcut>
              </CommandItem>
            ))}
            <CommandItem
              key={DIRECT_ASSIGNMENTS_ID}
              value="workstation direct assignments"
              onSelect={() => {
                onSelectWorkstation(DIRECT_ASSIGNMENTS_ID);
                onOpenChange(false);
              }}
            >
              <span className="font-medium">Affectations directes</span>
              <CommandShortcut>Poste</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {sortedTemplates.length > 0 && (
          <CommandGroup heading="Modeles">
            {sortedTemplates.map((template) => (
              <CommandItem
                key={template.id}
                value={`template ${template.title} ${
                  template.workstation?.name ?? ""
                } ${template.assignedToEmployee?.name ?? ""}`}
                onSelect={() => {
                  onSelectTemplate(template.id);
                  onOpenChange(false);
                }}
              >
                <span className="font-medium">{template.title}</span>
                {template.workstation && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {template.workstation.name}
                  </span>
                )}
                {template.assignedToEmployee && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {template.assignedToEmployee.name}
                  </span>
                )}
                <CommandShortcut>
                  {template.isRecurring ? "Recurrente" : "Ponctuelle"}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading="Taches (date selectionnee)">
            {tasks.map((task) => (
              <CommandItem
                key={task.id}
                value={`task ${task.taskTemplate.title} ${task.employee.name} ${
                  task.taskTemplate.workstation?.name ?? "direct"
                }`}
                onSelect={() => {
                  onSelectTask(task.id);
                  onOpenChange(false);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{task.taskTemplate.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.employee.name} -{" "}
                    {task.taskTemplate.workstation
                      ? task.taskTemplate.workstation.name
                      : "Affectation directe"}
                  </span>
                </div>
                <CommandShortcut>
                  {task.isCompleted ? "Terminee" : "En attente"}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
