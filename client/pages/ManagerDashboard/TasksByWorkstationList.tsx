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
  selectedTaskIds: string[];
  onToggleTaskSelection: (taskId: string) => void;
  isMultiSelectMode: boolean;
}

export function TasksByWorkstationList({
  tasksByWorkstation,
  teamMembers,
  onToggleTask,
  onReassignTask,
  emptyMessage = "No tasks found",
  pendingTaskId,
  isTaskUpdating = false,
  selectedTaskIds,
  onToggleTaskSelection,
  isMultiSelectMode,
}: TasksByWorkstationListProps) {
  const values = Object.values(tasksByWorkstation);

  if (values.length === 0) {
    return (
      <div className="text-center py-16 glass-card rounded-2xl border border-border/50 shadow-sm transition-all duration-300">
        <div className="w-16 h-16 mx-auto bg-secondary/50 rounded-full flex items-center justify-center mb-4">
          <div className="w-6 h-6 border-2 border-muted-foreground border-t-accent rounded-full animate-spin"></div>
        </div>
        <p className="text-lg font-medium text-muted-foreground">{emptyMessage}</p>
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
                  selectedTaskIds={selectedTaskIds}
                  onToggleTaskSelection={onToggleTaskSelection}
                  isMultiSelectMode={isMultiSelectMode}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
