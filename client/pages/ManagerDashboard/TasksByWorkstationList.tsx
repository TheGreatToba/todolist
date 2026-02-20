import React from "react";
import type { TasksByWorkstationMap } from "./types";
import { EmployeeTaskCard } from "./EmployeeTaskCard";
import type { TeamMember } from "@shared/api";

interface TasksByWorkstationListProps {
  tasksByWorkstation: TasksByWorkstationMap;
  teamMembers: TeamMember[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onReassignTask: (taskId: string, employeeId: string) => void;
  emptyMessage?: string;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
}

export function TasksByWorkstationList({
  tasksByWorkstation,
  teamMembers,
  onToggleTask,
  onReassignTask,
  emptyMessage = "No tasks found",
  pendingTaskId,
  isTaskUpdating = false,
}: TasksByWorkstationListProps) {
  const values = Object.values(tasksByWorkstation);

  if (values.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-xl border border-border">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {values.map((workstation) => (
        <div
          key={workstation.id}
          className="border-t border-border pt-8 first:border-t-0 first:pt-0"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {workstation.name}
          </h3>
          <div className="space-y-4">
            {Object.values(workstation.tasksByEmployee).map(
              ({ employee, tasks }) => (
                <EmployeeTaskCard
                  key={employee.id}
                  group={{ employee, tasks }}
                  teamMembers={teamMembers}
                  onToggleTask={onToggleTask}
                  onReassignTask={onReassignTask}
                  pendingTaskId={pendingTaskId}
                  isTaskUpdating={isTaskUpdating}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
