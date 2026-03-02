import React from "react";
import type { TodayBoardTask } from "@shared/api";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerTodayBoardQuery,
  useUpdateDailyTaskMutation,
} from "@/hooks/queries";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";

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
  accentClass,
  emptyMessage,
  tasks,
  pendingTaskId,
  isTaskUpdating,
  onToggleTask,
}: {
  title: string;
  accentClass: string;
  emptyMessage: string;
  tasks: TodayBoardTask[];
  pendingTaskId: string | null;
  isTaskUpdating: boolean;
  onToggleTask: (task: TodayBoardTask) => void;
}) {
  return (
    <section className={`rounded-xl border bg-card shadow-sm ${accentClass}`}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div className="space-y-3 p-4">
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        {tasks.map((task) => (
          <article
            key={task.id}
            className="rounded-lg border border-border bg-background px-3 py-3"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onToggleTask(task)}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50 ${
                  task.isCompleted
                    ? "border-primary bg-primary"
                    : "border-border bg-card hover:border-primary"
                }`}
                aria-label={
                  task.isCompleted
                    ? `Mark task ${task.taskTemplate.title} as pending`
                    : `Mark task ${task.taskTemplate.title} as done`
                }
              >
                {task.isCompleted && (
                  <svg
                    className="h-3 w-3 text-primary-foreground"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    task.isCompleted
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.taskTemplate.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.employee
                    ? `Assigned to ${task.employee.name}`
                    : "Unassigned"}
                </p>
                {task.completedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed at {formatTime(task.completedAt)}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function TodayBoard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: board, isLoading } = useManagerTodayBoardQuery();
  const updateDailyTask = useUpdateDailyTaskMutation();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleToggleTask = async (task: TodayBoardTask) => {
    try {
      await updateDailyTask.mutateAsync({
        taskId: task.id,
        isCompleted: !task.isCompleted,
      });
    } catch (error) {
      toastError(getErrorMessage(error, "Failed to update task."));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">Team not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please contact your administrator.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <TaskSection
            title="Overdue"
            accentClass="border-l-4 border-l-red-500"
            emptyMessage="No overdue tasks."
            tasks={board.overdue}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Today"
            accentClass="border-l-4 border-l-amber-500"
            emptyMessage="No pending tasks for today."
            tasks={board.today}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Completed"
            accentClass="border-l-4 border-l-emerald-500"
            emptyMessage="No completed tasks yet."
            tasks={board.completedToday}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
        </div>
      </main>
    </div>
  );
}
