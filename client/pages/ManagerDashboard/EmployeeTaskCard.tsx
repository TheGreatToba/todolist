import React from "react";
import type { TeamMember } from "@shared/api";
import type { TasksByEmployeeGroup } from "./types";

interface EmployeeTaskCardProps {
  group: TasksByEmployeeGroup;
  teamMembers: TeamMember[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onReassignTask: (taskId: string, employeeId: string) => void;
  pendingTaskId?: string | null;
}

export function EmployeeTaskCard({
  group,
  teamMembers,
  onToggleTask,
  onReassignTask,
  pendingTaskId,
}: EmployeeTaskCardProps) {
  const { employee, tasks } = group;
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
          <div key={task.id} className="flex items-center gap-3">
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                task.isCompleted
                  ? "bg-primary border-primary"
                  : "border-border bg-background"
              }`}
              aria-hidden
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
            </div>
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
              onClick={() => onToggleTask(task.id, task.isCompleted)}
              disabled={pendingTaskId === task.id}
              className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-secondary transition disabled:opacity-50"
            >
              {task.isCompleted ? "Mark pending" : "Mark done"}
            </button>
            <select
              value={task.employee.id}
              disabled={pendingTaskId === task.id}
              onChange={(e) => onReassignTask(task.id, e.target.value)}
              className="text-xs rounded-md border border-input bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
              aria-label={`Reassign task ${task.taskTemplate.title}`}
            >
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            {task.isCompleted && (
              <span className="text-xs font-medium text-primary">Done</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
