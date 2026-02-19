import React from "react";
import { Trash2 } from "lucide-react";
import type { WorkstationWithEmployees } from "@/hooks/queries";
import { OperationAlerts } from "./OperationAlerts";

interface WorkstationsTabProps {
  workstations: WorkstationWithEmployees[];
  newWorkstation: string;
  onNewWorkstationChange: (value: string) => void;
  onSubmitCreate: (e: React.FormEvent) => void;
  onDelete: (workstationId: string) => void;
  operationError: string | null;
  operationSuccess: string | null;
  setOperationError: (msg: string | null) => void;
  setOperationSuccess: (msg: string | null) => void;
}

export function WorkstationsTab({
  workstations,
  newWorkstation,
  onNewWorkstationChange,
  onSubmitCreate,
  onDelete,
  operationError,
  operationSuccess,
  setOperationError,
  setOperationSuccess,
}: WorkstationsTabProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Manage Workstations
        </h2>

        <OperationAlerts
          error={operationError}
          success={operationSuccess}
          onDismissError={() => setOperationError(null)}
          onDismissSuccess={() => setOperationSuccess(null)}
        />

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
        {workstations.map((ws) => (
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
            {ws.employees && ws.employees.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Assigned to:
                </p>
                <div className="space-y-1">
                  {ws.employees.map((ew) => (
                    <p key={ew.employee.id} className="text-sm text-foreground">
                      • {ew.employee.name}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
