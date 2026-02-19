import React, { useState } from "react";
import type { TeamMember } from "@shared/api";
import type { TasksByEmployeeGroup } from "./types";

interface EmployeeTaskCardProps {
  group: TasksByEmployeeGroup;
  teamMembers: TeamMember[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onReassignTask: (taskId: string, employeeId: string) => void;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
}

export function EmployeeTaskCard({
  group,
  teamMembers,
  onToggleTask,
  onReassignTask,
  pendingTaskId,
  isTaskUpdating = false,
}: EmployeeTaskCardProps) {
  const { employee, tasks } = group;
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(
    null,
  );
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>("");
  const empCompletedCount = tasks.filter((t) => t.isCompleted).length;
  const empProgressPercent =
    tasks.length > 0 ? Math.round((empCompletedCount / tasks.length) * 100) : 0;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-foreground">{employee.name}</h4>
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

      <div className="px-6 py-4 space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onToggleTask(task.id, task.isCompleted)}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-50 ${
                  task.isCompleted
                    ? "bg-primary border-primary"
                    : "border-border bg-background hover:border-primary"
                }`}
                aria-label={
                  task.isCompleted
                    ? `Mark task ${task.taskTemplate.title} as pending`
                    : `Mark task ${task.taskTemplate.title} as done`
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
                Reassign
              </button>
              {task.isCompleted && (
                <span className="text-xs font-medium text-primary">Done</span>
              )}
            </div>

            {reassigningTaskId === task.id && (
              <div className="ml-8 flex items-center gap-2">
                <select
                  value={targetEmployeeId}
                  disabled={isTaskUpdating && pendingTaskId === task.id}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
                  aria-label={`Select employee for task ${task.taskTemplate.title}`}
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
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setReassigningTaskId(null)}
                  className="text-xs px-2.5 py-1 rounded-md border border-input hover:bg-secondary transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
