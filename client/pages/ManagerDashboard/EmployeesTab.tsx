import React from "react";
import { Edit2 } from "lucide-react";
import type { WorkstationWithEmployees } from "@/hooks/queries";
import { OperationAlerts } from "./OperationAlerts";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  workstations: Array<{ id: string; name: string }>;
}

interface EmployeesTabProps {
  teamMembers: TeamMember[];
  workstations: WorkstationWithEmployees[];
  newEmployee: {
    name: string;
    email: string;
    workstationIds: string[];
  };
  onNewEmployeeChange: (next: {
    name: string;
    email: string;
    workstationIds: string[];
  }) => void;
  onSubmitCreate: (e: React.FormEvent) => void;
  editingEmployee: string | null;
  editingWorkstations: string[];
  setEditingEmployee: (id: string | null) => void;
  setEditingWorkstations: (ids: string[]) => void;
  onSaveWorkstations: (employeeId: string) => void;
  operationError: string | null;
  operationSuccess: string | null;
  setOperationError: (msg: string | null) => void;
  setOperationSuccess: (msg: string | null) => void;
}

export function EmployeesTab({
  teamMembers,
  workstations,
  newEmployee,
  onNewEmployeeChange,
  onSubmitCreate,
  editingEmployee,
  editingWorkstations,
  setEditingEmployee,
  setEditingWorkstations,
  onSaveWorkstations,
  operationError,
  operationSuccess,
  setOperationError,
  setOperationSuccess,
}: EmployeesTabProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Create New Employee
        </h2>

        <OperationAlerts
          error={operationError}
          success={operationSuccess}
          onDismissError={() => setOperationError(null)}
          onDismissSuccess={() => setOperationSuccess(null)}
        />

        <form
          onSubmit={onSubmitCreate}
          className="bg-card rounded-xl border border-border p-6 shadow-sm mb-8 space-y-4"
        >
          <p className="text-sm text-muted-foreground -mt-2">
            The employee will receive an email with a secure link to set their
            password (no password sent by email).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="employee-name"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Full Name
              </label>
              <input
                id="employee-name"
                type="text"
                required
                value={newEmployee.name}
                onChange={(e) =>
                  onNewEmployeeChange({ ...newEmployee, name: e.target.value })
                }
                placeholder="John Doe"
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label
                htmlFor="employee-email"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Email
              </label>
              <input
                id="employee-email"
                type="email"
                required
                value={newEmployee.email}
                onChange={(e) =>
                  onNewEmployeeChange({
                    ...newEmployee,
                    email: e.target.value,
                  })
                }
                placeholder="john@example.com"
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Workstations (Select one or more)
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                {workstations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No workstations available. Create one in the Workstations
                    tab first.
                  </p>
                ) : (
                  workstations.map((ws) => (
                    <label
                      key={ws.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newEmployee.workstationIds.includes(ws.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onNewEmployeeChange({
                              ...newEmployee,
                              workstationIds: [
                                ...newEmployee.workstationIds,
                                ws.id,
                              ],
                            });
                          } else {
                            onNewEmployeeChange({
                              ...newEmployee,
                              workstationIds: newEmployee.workstationIds.filter(
                                (id) => id !== ws.id,
                              ),
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm text-foreground">{ws.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            Create Employee
          </button>
        </form>
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-4">
        Team Members ({teamMembers.length})
      </h3>
      <div className="space-y-3">
        {teamMembers.length === 0 ? (
          <div className="text-center py-8 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">
              No employees yet. Create one above!
            </p>
          </div>
        ) : (
          teamMembers.map((member) => (
            <div
              key={member.id}
              className={`bg-card rounded-lg border transition ${
                editingEmployee === member.id
                  ? "border-primary"
                  : "border-border"
              } p-4`}
            >
              {editingEmployee === member.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                    {workstations.map((ws) => (
                      <label
                        key={ws.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editingWorkstations.includes(ws.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditingWorkstations([
                                ...editingWorkstations,
                                ws.id,
                              ]);
                            } else {
                              setEditingWorkstations(
                                editingWorkstations.filter(
                                  (id) => id !== ws.id,
                                ),
                              );
                            }
                          }}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-sm text-foreground">
                          {ws.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSaveWorkstations(member.id)}
                      className="flex-1 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingEmployee(null);
                        setEditingWorkstations([]);
                      }}
                      className="flex-1 px-3 py-2 border border-input text-foreground hover:bg-secondary rounded-lg transition text-sm"
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                    {member.workstations.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {member.workstations.map((ws) => (
                          <span
                            key={ws.id}
                            className="inline-block px-2 py-1 bg-primary/15 text-primary text-xs rounded-full"
                          >
                            {ws.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingEmployee(member.id);
                      setEditingWorkstations(
                        member.workstations.map((ws) => ws.id),
                      );
                    }}
                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                    title="Edit workstations"
                    type="button"
                    aria-label={`Edit workstations for ${member.name}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
