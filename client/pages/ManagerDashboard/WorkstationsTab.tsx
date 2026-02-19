import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TeamMember } from "@shared/api";
import type { WorkstationWithEmployees } from "@/hooks/queries";

interface WorkstationsTabProps {
  workstations: WorkstationWithEmployees[];
  teamMembers: TeamMember[];
  newWorkstation: string;
  onNewWorkstationChange: (value: string) => void;
  onSubmitCreate: (e: React.FormEvent) => void;
  onDelete: (workstationId: string) => void;
  onSaveEmployees: (workstationId: string, employeeIds: string[]) => void;
  isSavingEmployees?: boolean;
}

export function WorkstationsTab({
  workstations,
  teamMembers,
  newWorkstation,
  onNewWorkstationChange,
  onSubmitCreate,
  onDelete,
  onSaveEmployees,
  isSavingEmployees = false,
}: WorkstationsTabProps) {
  const [editingWorkstationId, setEditingWorkstationId] = useState<
    string | null
  >(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const membersByWorkstation = useMemo(() => {
    return new Map(
      workstations.map((ws) => [
        ws.id,
        (ws.employees ?? []).map((e) => e.employee.id),
      ]),
    );
  }, [workstations]);

  const startEdit = (workstationId: string) => {
    setEditingWorkstationId(workstationId);
    setSelectedEmployeeIds(membersByWorkstation.get(workstationId) ?? []);
  };

  const cancelEdit = () => {
    setEditingWorkstationId(null);
    setSelectedEmployeeIds([]);
  };

  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId),
    );
  };

  const saveEmployees = () => {
    if (!editingWorkstationId) return;
    onSaveEmployees(editingWorkstationId, selectedEmployeeIds);
    setEditingWorkstationId(null);
    setSelectedEmployeeIds([]);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Manage Workstations
        </h2>

        <form onSubmit={onSubmitCreate} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newWorkstation}
            onChange={(e) => onNewWorkstationChange(e.target.value)}
            placeholder="e.g., Checkout, Kitchen, Reception"
            className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Workstation name"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            Add Workstation
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workstations.map((ws) => {
          const isEditing = editingWorkstationId === ws.id;
          return (
            <div
              key={ws.id}
              className="bg-card rounded-xl border border-border p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground text-lg">
                  {ws.name}
                </h3>
                <button
                  onClick={() => onDelete(ws.id)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition"
                  title="Delete"
                  type="button"
                  aria-label={`Delete workstation ${ws.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {ws.employees?.length ?? 0} employee
                {(ws.employees?.length ?? 0) !== 1 ? "s" : ""}
              </p>

              {!isEditing && (
                <>
                  {ws.employees && ws.employees.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">
                        Assigned to:
                      </p>
                      <div className="space-y-1">
                        {ws.employees.map((ew) => (
                          <p
                            key={ew.employee.id}
                            className="text-sm text-foreground"
                          >
                            - {ew.employee.name}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(ws.id)}
                    className="mt-4 px-3 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition text-sm"
                  >
                    Manage employees
                  </button>
                </>
              )}

              {isEditing && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">
                    Select employees:
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {teamMembers.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.includes(member.id)}
                          onChange={(e) =>
                            toggleEmployee(member.id, e.target.checked)
                          }
                        />
                        <span>{member.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={saveEmployees}
                      disabled={isSavingEmployees}
                      className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition text-sm disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-3 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
