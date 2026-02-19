import React from "react";
import { Edit2, Trash2 } from "lucide-react";
import type { TaskTemplateWithRelations } from "@shared/api";

interface TemplatesTabProps {
  templates: TaskTemplateWithRelations[];
  onEdit: (template: TaskTemplateWithRelations) => void;
  onDelete: (templateId: string) => void;
  onCreateTemplate: () => void;
}

export function TemplatesTab({
  templates,
  onEdit,
  onDelete,
  onCreateTemplate,
}: TemplatesTabProps) {
  const handleDelete = (templateId: string, title: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the template "${title}"? This will also delete all associated daily tasks.`,
      )
    )
      return;
    onDelete(templateId);
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold text-foreground">Task Templates</h2>
          <button
            type="button"
            onClick={onCreateTemplate}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
          >
            Create template
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Manage your task templates. Templates define recurring tasks that are
          automatically assigned to employees.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground mb-4">No task templates yet.</p>
          <button
            type="button"
            onClick={onCreateTemplate}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-card rounded-xl border border-border p-6 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-lg mb-1">
                    {template.title}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-2 flex-shrink-0">
                  <button
                    onClick={() => onEdit(template)}
                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                    title="Edit template"
                    type="button"
                    aria-label={`Edit template ${template.title}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id, template.title)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition"
                    title="Delete template"
                    type="button"
                    aria-label={`Delete template ${template.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Assigned to:</span>
                  <span className="text-foreground font-medium">
                    {template.workstation
                      ? `Workstation: ${template.workstation.name}`
                      : template.assignedToEmployee
                        ? `Employee: ${template.assignedToEmployee.name}`
                        : "Not assigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="text-foreground">
                    {template.isRecurring ? "Recurring" : "One-time"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Notifications:</span>
                  <span className="text-foreground">
                    {template.notifyEmployee ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="text-foreground">
                    {new Date(template.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
