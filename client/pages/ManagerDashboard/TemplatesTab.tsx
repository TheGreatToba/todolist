import React from "react";
import { Edit2, Trash2 } from "lucide-react";
import type {
  TaskTemplateWithRelations,
  TeamMember,
  ManagerBatchTaskTemplatesAction,
} from "@shared/api";
import type { WorkstationWithEmployees } from "@/hooks/queries";
import { trackManagerKpiEvent } from "@/lib/metrics";

interface TemplatesTabProps {
  templates: TaskTemplateWithRelations[];
  onEdit: (template: TaskTemplateWithRelations) => void;
  onDelete: (templateId: string) => void;
  onCreateTemplate: () => void;
  teamMembers: TeamMember[];
  workstations: WorkstationWithEmployees[];
  onBatchUpdateTemplates?: (options: ManagerBatchTaskTemplatesAction) => void;
  isBatchUpdatingTemplates?: boolean;
}

export function TemplatesTab({
  templates,
  onEdit,
  onDelete,
  onCreateTemplate,
  teamMembers,
  workstations,
  onBatchUpdateTemplates,
  isBatchUpdatingTemplates = false,
}: TemplatesTabProps) {
  const [taskTypeTab, setTaskTypeTab] = React.useState<
    "recurring" | "one-shot"
  >("recurring");
  const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<
    string[]
  >([]);
  const [batchEmployeeId, setBatchEmployeeId] = React.useState<string>("");
  const [batchWorkstationId, setBatchWorkstationId] =
    React.useState<string>("");
  const handleDelete = (templateId: string) => {
    onDelete(templateId);
  };
  const recurringTemplates = templates.filter(
    (template) => template.isRecurring,
  );
  const oneShotTemplates = templates.filter(
    (template) => !template.isRecurring,
  );
  const filteredTemplates =
    taskTypeTab === "recurring" ? recurringTemplates : oneShotTemplates;

  React.useEffect(() => {
    setSelectedTemplateIds([]);
    setBatchEmployeeId("");
    setBatchWorkstationId("");
  }, [taskTypeTab, templates]);

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId],
    );
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold text-foreground">
            Modèles de tâches
          </h2>
          <button
            type="button"
            onClick={onCreateTemplate}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
          >
            Créer un modèle
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Gérez vos modèles de tâches. Les modèles définissent les tâches
          récurrentes attribuées automatiquement aux employés.
        </p>
        <div className="mb-6">
          <div className="grid w-full grid-cols-2 rounded-xl border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setTaskTypeTab("recurring")}
              aria-label={`Récurrentes (${recurringTemplates.length})`}
              className={`min-h-11 rounded-lg px-3 py-3 text-sm font-medium transition ${
                taskTypeTab === "recurring"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {`Récurrentes (${recurringTemplates.length})`}
            </button>
            <button
              type="button"
              onClick={() => setTaskTypeTab("one-shot")}
              aria-label={`One-shot (${oneShotTemplates.length})`}
              className={`min-h-11 rounded-lg px-3 py-3 text-sm font-medium transition ${
                taskTypeTab === "one-shot"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {`One-shot (${oneShotTemplates.length})`}
            </button>
          </div>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground mb-4">
            {taskTypeTab === "recurring"
              ? "Aucune tâche récurrente."
              : "Aucune tâche one-shot."}
          </p>
          {templates.length === 0 && (
            <button
              type="button"
              onClick={onCreateTemplate}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
            >
              Créer votre premier modèle
            </button>
          )}
        </div>
      ) : (
        <>
          {selectedTemplateIds.length > 0 && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-foreground">
                {selectedTemplateIds.length} template
                {selectedTemplateIds.length > 1 ? "s" : ""} selected
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={batchEmployeeId}
                  onChange={(e) => setBatchEmployeeId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  disabled={isBatchUpdatingTemplates}
                  aria-label="Select employee for batch template assignment"
                >
                  <option value="">Assigner à un employé…</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Assign to employee"
                  onClick={() => {
                    if (!batchEmployeeId || !onBatchUpdateTemplates) return;
                    onBatchUpdateTemplates({
                      templateIds: selectedTemplateIds,
                      action: "assignToEmployee",
                      employeeId: batchEmployeeId,
                    });
                    trackManagerKpiEvent("manager.batch_update_templates", {
                      mode: "assignToEmployee",
                      templateCount: selectedTemplateIds.length,
                      employeeId: batchEmployeeId,
                    });
                  }}
                  disabled={
                    !batchEmployeeId ||
                    !onBatchUpdateTemplates ||
                    isBatchUpdatingTemplates ||
                    selectedTemplateIds.length === 0
                  }
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  Assigner à un employé
                </button>

                <select
                  value={batchWorkstationId}
                  onChange={(e) => setBatchWorkstationId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  disabled={isBatchUpdatingTemplates}
                  aria-label="Select workstation for batch template assignment"
                >
                  <option value="">Assigner à un poste…</option>
                  {workstations.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Assign to workstation"
                  onClick={() => {
                    if (!batchWorkstationId || !onBatchUpdateTemplates) return;
                    onBatchUpdateTemplates({
                      templateIds: selectedTemplateIds,
                      action: "assignToWorkstation",
                      workstationId: batchWorkstationId,
                    });
                    trackManagerKpiEvent("manager.batch_update_templates", {
                      mode: "assignToWorkstation",
                      templateCount: selectedTemplateIds.length,
                      workstationId: batchWorkstationId,
                    });
                  }}
                  disabled={
                    !batchWorkstationId ||
                    !onBatchUpdateTemplates ||
                    isBatchUpdatingTemplates ||
                    selectedTemplateIds.length === 0
                  }
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  Assigner à un poste
                </button>

                <button
                  type="button"
                  aria-label="Clear assignment"
                  onClick={() => {
                    if (!onBatchUpdateTemplates) return;
                    onBatchUpdateTemplates({
                      templateIds: selectedTemplateIds,
                      action: "clearAssignment",
                    });
                    trackManagerKpiEvent("manager.batch_update_templates", {
                      mode: "clearAssignment",
                      templateCount: selectedTemplateIds.length,
                    });
                  }}
                  disabled={
                    !onBatchUpdateTemplates ||
                    isBatchUpdatingTemplates ||
                    selectedTemplateIds.length === 0
                  }
                  className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/70 disabled:opacity-50"
                >
                  Supprimer l&apos;affectation
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateIds([]);
                    setBatchEmployeeId("");
                    setBatchWorkstationId("");
                  }}
                  className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary/60"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-card rounded-xl border border-border p-4 md:p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(template.id)}
                      onChange={() => toggleTemplateSelection(template.id)}
                      className="mt-1 h-4 w-4 flex-shrink-0 rounded border-border text-primary focus:ring-primary"
                      aria-label={`Select template ${template.title}`}
                    />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-lg mb-1">
                        {template.title}
                      </h3>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {template.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2 flex-shrink-0">
                    <button
                      onClick={() => onEdit(template)}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                      title="Modifier le modele"
                      type="button"
                      aria-label={`Modifier le modele ${template.title}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition"
                      title="Supprimer le modele"
                      type="button"
                      aria-label={`Supprimer le modele ${template.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Assigné à :</span>
                    <span className="text-foreground font-medium">
                      {template.workstation
                        ? `Poste : ${template.workstation.name}`
                        : template.assignedToEmployee
                          ? `Employé : ${template.assignedToEmployee.name}`
                          : "Non assigné"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Type :</span>
                    <span className="text-foreground">
                      {template.isRecurring ? "Récurrente" : "Ponctuelle"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Notifications :
                    </span>
                    <span className="text-foreground">
                      {template.notifyEmployee ? "Activées" : "Désactivées"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Créée le :</span>
                    <span className="text-foreground">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
