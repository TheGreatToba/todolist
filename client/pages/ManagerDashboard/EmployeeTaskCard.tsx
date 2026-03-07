import React, { useState } from "react";
import type { TeamMember } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { todayLocalISO } from "@/lib/date-utils";
import type { TasksByEmployeeGroup } from "./types";

interface EmployeeTaskCardProps {
  group: TasksByEmployeeGroup;
  teamMembers: TeamMember[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onReassignTask: (taskId: string, employeeId: string) => void;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
  selectedTaskIds: string[];
  onToggleTaskSelection: (taskId: string) => void;
  isMultiSelectMode: boolean;
}

export function EmployeeTaskCard({
  group,
  teamMembers,
  onToggleTask,
  onReassignTask,
  pendingTaskId,
  isTaskUpdating = false,
  selectedTaskIds,
  onToggleTaskSelection,
  isMultiSelectMode,
}: EmployeeTaskCardProps) {
  const { employee, tasks } = group;
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(
    null,
  );
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>("");
  const empCompletedCount = tasks.filter((t) => t.isCompleted).length;
  const empProgressPercent =
    tasks.length > 0 ? Math.round((empCompletedCount / tasks.length) * 100) : 0;
  const today = todayLocalISO();

  return (
    <div className="glass-card rounded-xl border border-border/50 shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="px-6 py-4 border-b border-border/50 bg-background/40 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-foreground drop-shadow-sm">
              {employee.name}
            </h4>
            <p className="text-sm text-muted-foreground">{employee.email}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">
              {empProgressPercent}%
            </p>
            <p className="text-xs text-muted-foreground">
              {empCompletedCount}/{tasks.length}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="group relative rounded-xl border border-border/40 bg-background/30 px-4 py-3 transition-all duration-300 hover:bg-card hover:shadow-md hover:border-primary/30"
          >
            <div className="flex items-center gap-4">
              {isMultiSelectMode && (
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={() => onToggleTaskSelection(task.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary shadow-sm"
                  aria-label={`Selectionner la tache ${task.taskTemplate.title}`}
                />
              )}
              <button
                type="button"
                onClick={() => onToggleTask(task.id, task.isCompleted)}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 disabled:opacity-50 ${
                  task.isCompleted
                    ? "bg-primary border-primary shadow-[0_0_10px_rgba(233,30,99,0.5)]"
                    : "border-muted-foreground/30 bg-card hover:border-primary hover:shadow-sm"
                }`}
                aria-label={
                  task.isCompleted
                    ? `Marquer la tache ${task.taskTemplate.title} comme en attente`
                    : `Marquer la tache ${task.taskTemplate.title} comme terminee`
                }
              >
                {task.isCompleted && (
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium transition-all ${
                    task.isCompleted
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.taskTemplate.title}
                </p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {task.isCompleted ? (
                    <span className="inline-flex items-center rounded-full bg-[#22C55E] px-2 py-0.5 text-[10px] font-semibold text-white">
                      done
                    </span>
                  ) : task.date < today ? (
                    <span className="inline-flex items-center rounded-full bg-[#EF4444] px-2 py-0.5 text-[10px] font-semibold text-white">
                      overdue
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[#F97316] px-2 py-0.5 text-[10px] font-semibold text-white">
                      pending
                    </span>
                  )}
                  {typeof task.priorityScore === "number" && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        task.priorityScore >= 80
                          ? "bg-red-100 text-red-700"
                          : task.priorityScore >= 50
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Priorité {task.priorityScore}
                    </span>
                  )}
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {task.taskTemplate.isRecurring
                      ? "Recurrente"
                      : "Ponctuelle"}
                  </Badge>
                </div>
                {task.taskTemplate.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.taskTemplate.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isTaskUpdating && pendingTaskId === task.id}
                onClick={() => {
                  setReassigningTaskId(task.id);
                  setTargetEmployeeId(task.employee.id);
                }}
                className="text-xs px-2.5 py-1 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-secondary transition disabled:opacity-50"
              >
                Reaffecter
              </button>
              {task.isCompleted && (
                <span className="text-xs font-medium text-primary">Faite</span>
              )}
            </div>

            {reassigningTaskId === task.id && (
              <div className="ml-2 sm:ml-8 mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={targetEmployeeId}
                  disabled={isTaskUpdating && pendingTaskId === task.id}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
                  aria-label={`Selectionner un employe pour la tache ${task.taskTemplate.title}`}
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    (isTaskUpdating && pendingTaskId === task.id) ||
                    !targetEmployeeId ||
                    targetEmployeeId === task.employee.id
                  }
                  onClick={() => {
                    onReassignTask(task.id, targetEmployeeId);
                    setReassigningTaskId(null);
                  }}
                  className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  onClick={() => setReassigningTaskId(null)}
                  className="text-xs px-2.5 py-1 rounded-md border border-input hover:bg-secondary transition"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
