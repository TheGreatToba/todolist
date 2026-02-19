import React, { useRef } from "react";
import { X } from "lucide-react";
import type { TaskTemplateWithRelations } from "@shared/api";
import type { TeamMember } from "./types";
import { useModalA11y } from "./useModalA11y";

export interface EditTaskTemplateFormState {
  title: string;
  description: string;
  workstationId: string;
  assignedToEmployeeId: string;
  assignmentType: "workstation" | "employee";
  isRecurring: boolean;
  notifyEmployee: boolean;
}

interface EditTaskTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: TaskTemplateWithRelations | null;
  form: EditTaskTemplateFormState;
  onFormChange: (next: EditTaskTemplateFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  workstations: Array<{ id: string; name: string }>;
  teamMembers: TeamMember[];
  isSubmitting?: boolean;
}

export function EditTaskTemplateModal({
  isOpen,
  onClose,
  template,
  form,
  onFormChange,
  onSubmit,
  workstations,
  teamMembers,
  isSubmitting = false,
}: EditTaskTemplateModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, isOpen, onClose);

  if (!isOpen || !template) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="bg-card rounded-xl shadow-lg max-w-md w-full p-6 border border-border max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-template-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="edit-template-modal-title"
            className="text-xl font-bold text-foreground"
          >
            Edit Task Template
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition"
            aria-label="Close edit template modal"
            type="button"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="edit-template-title"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Task Title
            </label>
            <input
              id="edit-template-title"
              type="text"
              required
              value={form.title}
              onChange={(e) => onFormChange({ ...form, title: e.target.value })}
              placeholder="e.g., Clean the workstation"
              className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-foreground mb-2">
              Assign To
            </span>
            <div className="flex gap-3">
              <label
                className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition"
                style={{
                  borderColor:
                    form.assignmentType === "workstation"
                      ? "var(--primary)"
                      : "var(--border)",
                }}
              >
                <input
                  type="radio"
                  checked={form.assignmentType === "workstation"}
                  onChange={() => {
                    onFormChange({
                      ...form,
                      assignmentType: "workstation",
                      assignedToEmployeeId: "",
                    });
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-foreground">
                  Workstation
                </span>
              </label>
              <label
                className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition"
                style={{
                  borderColor:
                    form.assignmentType === "employee"
                      ? "var(--primary)"
                      : "var(--border)",
                }}
              >
                <input
                  type="radio"
                  checked={form.assignmentType === "employee"}
                  onChange={() => {
                    onFormChange({
                      ...form,
                      assignmentType: "employee",
                      workstationId: "",
                    });
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-foreground">
                  Employee
                </span>
              </label>
            </div>
          </div>

          {form.assignmentType === "workstation" && (
            <div>
              <label
                htmlFor="edit-template-workstation"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Workstation
              </label>
              <select
                id="edit-template-workstation"
                required
                value={form.workstationId}
                onChange={(e) =>
                  onFormChange({ ...form, workstationId: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a workstation</option>
                {workstations.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.assignmentType === "employee" && (
            <div>
              <label
                htmlFor="edit-template-employee"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Employee
              </label>
              <select
                id="edit-template-employee"
                required
                value={form.assignedToEmployeeId}
                onChange={(e) =>
                  onFormChange({
                    ...form,
                    assignedToEmployeeId: e.target.value,
                  })
                }
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select an employee</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="edit-template-description"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Description (optional)
            </label>
            <textarea
              id="edit-template-description"
              value={form.description}
              onChange={(e) =>
                onFormChange({ ...form, description: e.target.value })
              }
              placeholder="Add any additional details..."
              className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-secondary">
            <input
              type="checkbox"
              id="edit-template-recurring"
              checked={form.isRecurring}
              onChange={(e) =>
                onFormChange({ ...form, isRecurring: e.target.checked })
              }
              className="w-4 h-4 rounded"
            />
            <label
              htmlFor="edit-template-recurring"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              Recurring task (created daily)
            </label>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-secondary">
            <input
              type="checkbox"
              id="edit-template-notify"
              checked={form.notifyEmployee}
              onChange={(e) =>
                onFormChange({ ...form, notifyEmployee: e.target.checked })
              }
              className="w-4 h-4 rounded"
            />
            <label
              htmlFor="edit-template-notify"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              Notify employee when task is assigned
            </label>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition font-medium disabled:opacity-50"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
