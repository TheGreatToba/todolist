import React, { useRef } from "react";
import { X } from "lucide-react";
import type {
  ManagerDashboard as ManagerDashboardType,
  TaskTemplateWithRelations,
} from "@shared/api";
import type { TeamMember } from "./types";
import { useModalA11y } from "./useModalA11y";

export interface NewTaskFormState {
  creationMode: "create" | "template";
  templateId: string;
  title: string;
  description: string;
  workstationId: string;
  assignedToEmployeeId: string;
  assignmentType: "workstation" | "employee" | "none";
  notifyEmployee: boolean;
  isRecurring: boolean;
}

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: NewTaskFormState;
  onFormChange: (next: NewTaskFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  workstations: ManagerDashboardType["workstations"];
  templates: TaskTemplateWithRelations[];
  teamMembers: TeamMember[];
  isSubmitting?: boolean;
}

export function NewTaskModal({
  isOpen,
  onClose,
  form,
  onFormChange,
  onSubmit,
  workstations,
  templates,
  teamMembers,
  isSubmitting = false,
}: NewTaskModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, isOpen, onClose);
  const selectedTemplate = templates.find((t) => t.id === form.templateId);
  const canStayUnassigned = form.creationMode === "create" && form.isRecurring;

  if (!isOpen) return null;

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
        aria-labelledby="new-task-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="new-task-modal-title"
            className="text-xl font-bold text-foreground"
          >
            Creer une nouvelle tache
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition"
            aria-label="Fermer la modale de nouvelle tache"
            type="button"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="task-creation-mode"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Source
            </label>
            <select
              id="task-creation-mode"
              value={form.creationMode}
              onChange={(e) =>
                onFormChange({
                  ...form,
                  creationMode: e.target.value as "create" | "template",
                  templateId: "",
                  assignmentType:
                    e.target.value === "template" &&
                    form.assignmentType === "none"
                      ? "workstation"
                      : form.assignmentType,
                })
              }
              className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="create">Creer un nouveau modele</option>
              <option value="template">Utiliser un modele existant</option>
            </select>
          </div>

          {form.creationMode === "template" && (
            <div>
              <label
                htmlFor="task-template"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Modele existant
              </label>
              <select
                id="task-template"
                required
                value={form.templateId}
                onChange={(e) => {
                  const nextTemplateId = e.target.value;
                  const nextTemplate = templates.find(
                    (template) => template.id === nextTemplateId,
                  );

                  let nextForm: NewTaskFormState = {
                    ...form,
                    templateId: nextTemplateId,
                  };

                  if (nextTemplate) {
                    // Heuristic: prefer explicit employee assignment, then workstation.
                    if (nextTemplate.assignedToEmployeeId) {
                      nextForm = {
                        ...nextForm,
                        assignmentType: "employee",
                        assignedToEmployeeId: nextTemplate.assignedToEmployeeId,
                        workstationId: "",
                      };
                    } else if (nextTemplate.workstationId) {
                      nextForm = {
                        ...nextForm,
                        assignmentType: "workstation",
                        workstationId: nextTemplate.workstationId,
                        assignedToEmployeeId: "",
                      };
                    } else {
                      // Template sans affectation : repartir neutre (ne pas garder l’état précédent).
                      nextForm = {
                        ...nextForm,
                        assignmentType: "workstation",
                        workstationId: "",
                        assignedToEmployeeId: "",
                      };
                    }

                    // Align notification preference with template when possible.
                    if (typeof nextTemplate.notifyEmployee === "boolean") {
                      nextForm = {
                        ...nextForm,
                        notifyEmployee: nextTemplate.notifyEmployee,
                      };
                    }
                  }

                  onFormChange(nextForm);
                }}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selectionner un modele</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedTemplate.description || "Aucune description"}
                </p>
              )}
            </div>
          )}

          {form.creationMode === "create" && (
            <div>
              <label
                htmlFor="task-title"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Titre de la tache
              </label>
              <input
                id="task-title"
                type="text"
                required
                value={form.title}
                onChange={(e) =>
                  onFormChange({ ...form, title: e.target.value })
                }
                placeholder="Ex. : Nettoyer le poste"
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {form.creationMode === "create" && (
            <div>
              <span className="block text-sm font-medium text-foreground mb-2">
                Type de tache
              </span>
              <div className="flex gap-3">
                <label
                  className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition"
                  style={{
                    borderColor: form.isRecurring
                      ? "var(--primary)"
                      : "var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    checked={form.isRecurring}
                    onChange={() =>
                      onFormChange({ ...form, isRecurring: true })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Recurrente
                  </span>
                </label>
                <label
                  className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition"
                  style={{
                    borderColor: !form.isRecurring
                      ? "var(--primary)"
                      : "var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    checked={!form.isRecurring}
                    onChange={() => {
                      onFormChange({
                        ...form,
                        isRecurring: false,
                        assignmentType:
                          form.assignmentType === "none"
                            ? "workstation"
                            : form.assignmentType,
                      });
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Ponctuelle
                  </span>
                </label>
              </div>
            </div>
          )}

          <div>
            <span className="block text-sm font-medium text-foreground mb-2">
              Affecter a
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Poste
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
                  Employe
                </span>
              </label>
              {canStayUnassigned && (
                <label
                  className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition"
                  style={{
                    borderColor:
                      form.assignmentType === "none"
                        ? "var(--primary)"
                        : "var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    checked={form.assignmentType === "none"}
                    onChange={() => {
                      onFormChange({
                        ...form,
                        assignmentType: "none",
                        workstationId: "",
                        assignedToEmployeeId: "",
                      });
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Non assignee
                  </span>
                </label>
              )}
            </div>
          </div>

          {form.assignmentType === "workstation" && (
            <div>
              <label
                htmlFor="task-workstation"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Poste
              </label>
              <select
                id="task-workstation"
                required
                value={form.workstationId}
                onChange={(e) =>
                  onFormChange({ ...form, workstationId: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selectionner un poste</option>
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
                htmlFor="task-employee"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Employe
              </label>
              <select
                id="task-employee"
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
                <option value="">Selectionner un employe</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.creationMode === "create" && (
            <div>
              <label
                htmlFor="task-description"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Description (optionnelle)
              </label>
              <textarea
                id="task-description"
                value={form.description}
                onChange={(e) =>
                  onFormChange({ ...form, description: e.target.value })
                }
                placeholder="Ajouter des details complementaires..."
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={3}
              />
            </div>
          )}

          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-secondary">
            <input
              type="checkbox"
              id="notifyEmployee"
              checked={form.notifyEmployee}
              onChange={(e) =>
                onFormChange({ ...form, notifyEmployee: e.target.checked })
              }
              className="w-4 h-4 rounded"
            />
            <label
              htmlFor="notifyEmployee"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              Notifier l'employe lors de l'affectation
            </label>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition font-medium disabled:opacity-50"
            >
              {form.creationMode === "template"
                ? "Affecter la tache"
                : "Creer la tache"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
