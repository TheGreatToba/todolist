import React, { useState } from "react";
import type { TeamMember } from "@shared/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { TasksByEmployeeGroup } from "./types";
import type { DashboardTask } from "./types";

function haptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

interface TaskRowProps {
  task: DashboardTask;
  isTaskUpdating: boolean;
  pendingTaskId?: string | null;
  selectedTaskIds: string[];
  isMultiSelectMode: boolean;
  overdueTaskIds?: string[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onToggleTaskSelection: (taskId: string) => void;
  onOpenReassign: (taskId: string, currentEmployeeId: string) => void;
}

function TaskRow({
  task,
  isTaskUpdating,
  pendingTaskId,
  selectedTaskIds,
  isMultiSelectMode,
  overdueTaskIds,
  onToggleTask,
  onToggleTaskSelection,
  onOpenReassign,
}: TaskRowProps) {
  const isPending = isTaskUpdating && pendingTaskId === task.id;
  const isOverdue = overdueTaskIds?.includes(task.id) ?? false;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/80 px-4 py-3 transition-colors hover:bg-card hover:shadow-md shadow-sm",
        isOverdue && "border-l-4 border-red-500 bg-red-500/5",
        task.isCompleted && "opacity-50",
      )}
    >
      <div className="flex items-center gap-4">
        {isMultiSelectMode && (
          <input
            type="checkbox"
            checked={selectedTaskIds.includes(task.id)}
            onChange={() => onToggleTaskSelection(task.id)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary shadow-sm"
            aria-label={`Select task ${task.taskTemplate.title}`}
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (!task.isCompleted) haptic();
            onToggleTask(task.id, task.isCompleted);
          }}
          disabled={isPending}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-50 ${
            task.isCompleted
              ? "bg-primary border-primary"
              : "border-muted-foreground/30 bg-card hover:border-primary"
          }`}
          aria-label={
            task.isCompleted
              ? `Marquer ${task.taskTemplate.title} comme en attente`
              : `Marquer ${task.taskTemplate.title} comme terminée`
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
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              task.isCompleted
                ? "text-muted-foreground line-through"
                : "text-foreground"
            }`}
          >
            {task.taskTemplate.title}
          </p>
          <div className="mt-1">
            <Badge variant="secondary" className="text-[10px] uppercase">
              {task.taskTemplate.isRecurring ? "Récurrente" : "Ponctuelle"}
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
          disabled={isPending}
          onClick={() => onOpenReassign(task.id, task.employee.id)}
          className="text-xs px-2.5 py-1 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-secondary transition disabled:opacity-50 flex-shrink-0"
        >
          Réaffecter
        </button>
        {task.isCompleted && (
          <span className="text-xs font-medium text-primary flex-shrink-0">
            Faite
          </span>
        )}
      </div>
    </div>
  );
}

interface EmployeeTaskCardProps {
  group: TasksByEmployeeGroup;
  teamMembers: TeamMember[];
  overdueTaskIds?: string[];
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
  overdueTaskIds,
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
  const reassigningTask = tasks.find((t) => t.id === reassigningTaskId);
  const empCompletedCount = tasks.filter((t) => t.isCompleted).length;
  const empProgressPercent =
    tasks.length > 0 ? Math.round((empCompletedCount / tasks.length) * 100) : 0;

  return (
    <div className="glass-card rounded-xl border border-border/60 shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border/60 bg-background/60 backdrop-blur-md">
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

      <div className="px-4 md:px-6 py-3 md:py-4 space-y-2 md:space-y-3">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isTaskUpdating={isTaskUpdating}
            pendingTaskId={pendingTaskId}
            selectedTaskIds={selectedTaskIds}
            isMultiSelectMode={isMultiSelectMode}
            overdueTaskIds={overdueTaskIds}
            onToggleTask={onToggleTask}
            onToggleTaskSelection={onToggleTaskSelection}
            onOpenReassign={(taskId) => setReassigningTaskId(taskId)}
          />
        ))}
      </div>

      <Drawer
        open={reassigningTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setReassigningTaskId(null);
        }}
      >
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>
              Réaffecter : {reassigningTask?.taskTemplate.title ?? ""}
            </DrawerTitle>
          </DrawerHeader>
          <div className="grid gap-2 px-4 pb-6 overflow-y-auto">
            {teamMembers.map((member) => {
              const isCurrent =
                reassigningTask && member.id === reassigningTask.employee.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    if (!reassigningTaskId) return;
                    haptic();
                    onReassignTask(reassigningTaskId, member.id);
                    setReassigningTaskId(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition touch-manipulation",
                    "min-h-[56px] text-base font-medium",
                    isCurrent
                      ? "cursor-not-allowed border-muted bg-muted/50 text-muted-foreground"
                      : "border-border bg-card hover:bg-secondary active:bg-secondary/80",
                  )}
                  aria-label={`Réaffecter à ${member.name}`}
                >
                  <span className="flex-1">{member.name}</span>
                  {isCurrent && (
                    <span className="text-xs text-muted-foreground">
                      Actuel
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
