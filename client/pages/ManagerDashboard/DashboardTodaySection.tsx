import React from "react";
import type { TodayBoardTask } from "@shared/api";
import { Check, Clock, User } from "lucide-react";
import { useManagerTodayBoardQuery } from "@/hooks/queries";

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskSection({
  title,
  colorClasses,
  emptyMessage,
  tasks,
  pendingTaskId,
  isTaskUpdating,
  onToggleTask,
}: {
  title: string;
  colorClasses: { card: string; badge: string; title: string; border: string };
  emptyMessage: string;
  tasks: TodayBoardTask[];
  pendingTaskId: string | null;
  isTaskUpdating: boolean;
  onToggleTask: (task: TodayBoardTask) => void;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-4 md:p-6 shadow-lg transition-transform hover:-translate-y-1 flex flex-col ${colorClasses.card} ${colorClasses.border}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className={`text-sm font-semibold uppercase tracking-wider ${colorClasses.title}`}
        >
          {title}
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${colorClasses.badge}`}
        >
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[350px]">
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-3 text-xs text-center text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              task.isCompleted
                ? "border-border/50 bg-secondary/20 opacity-75"
                : "border-border bg-background/50"
            }`}
          >
            <button
              type="button"
              onClick={() => onToggleTask(task)}
              disabled={isTaskUpdating && pendingTaskId === task.id}
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50 ${
                task.isCompleted
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30 bg-card hover:border-primary"
              }`}
              aria-label={
                task.isCompleted
                  ? `Marquer ${task.taskTemplate.title} comme en attente`
                  : `Marquer ${task.taskTemplate.title} comme terminée`
              }
            >
              {task.isCompleted && (
                <Check
                  className="h-2.5 w-2.5 text-primary-foreground"
                  strokeWidth={3}
                />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-medium ${
                  task.isCompleted
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {task.taskTemplate.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">
                  <User className="w-2.5 h-2.5" />
                  {task.employee ? task.employee.name : "Non assignée"}
                </span>
                {task.completedAt && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    {formatTime(task.completedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardTodaySectionProps {
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  pendingTaskId: string | null;
  isTaskUpdating: boolean;
}

export function DashboardTodaySection({
  onToggleTask,
  pendingTaskId,
  isTaskUpdating,
}: DashboardTodaySectionProps) {
  const { data: board, isLoading } = useManagerTodayBoardQuery();

  const sortedOverdue = React.useMemo(
    () =>
      [...(board?.overdue ?? [])].sort(
        (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
      ),
    [board?.overdue],
  );
  const sortedToday = React.useMemo(
    () =>
      [...(board?.today ?? [])].sort(
        (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
      ),
    [board?.today],
  );
  const sortedCompletedToday = React.useMemo(
    () =>
      [...(board?.completedToday ?? [])].sort(
        (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
      ),
    [board?.completedToday],
  );

  const handleToggle = (task: TodayBoardTask) => {
    onToggleTask(task.id, task.isCompleted);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[200px] bg-card/50 rounded-xl border border-border/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <TaskSection
        title="En retard"
        colorClasses={{
          card: "bg-red-50/80",
          border: "border-red-200",
          badge: "bg-red-500 text-white",
          title: "text-red-700",
        }}
        emptyMessage="Aucune tâche en retard."
        tasks={sortedOverdue}
        pendingTaskId={pendingTaskId}
        isTaskUpdating={isTaskUpdating}
        onToggleTask={handleToggle}
      />
      <TaskSection
        title="Aujourd'hui"
        colorClasses={{
          card: "bg-amber-50/80",
          border: "border-amber-200",
          badge: "bg-amber-500 text-white",
          title: "text-amber-700",
        }}
        emptyMessage="Aucune tâche en attente."
        tasks={sortedToday}
        pendingTaskId={pendingTaskId}
        isTaskUpdating={isTaskUpdating}
        onToggleTask={handleToggle}
      />
      <TaskSection
        title="Terminées"
        colorClasses={{
          card: "bg-emerald-50/80",
          border: "border-emerald-200",
          badge: "bg-emerald-500 text-white",
          title: "text-emerald-700",
        }}
        emptyMessage="Aucune tâche terminée."
        tasks={sortedCompletedToday}
        pendingTaskId={pendingTaskId}
        isTaskUpdating={isTaskUpdating}
        onToggleTask={handleToggle}
      />
    </div>
  );
}
