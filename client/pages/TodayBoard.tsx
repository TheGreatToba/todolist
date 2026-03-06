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
    <section className={`glass-card flex flex-col overflow-hidden ${accentClass}`}>
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-4 bg-background/30 backdrop-blur-sm">
        <h2 className="text-lg font-bold text-foreground tracking-tight drop-shadow-sm">{title}</h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary shadow-inner">
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
            className="group relative rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm px-4 py-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-card hover:border-primary/30"
          >
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => onToggleTask(task)}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 disabled:opacity-50 ${task.isCompleted
                  ? "border-primary bg-primary shadow-[0_0_10px_rgba(233,30,99,0.5)]"
                  : "border-muted-foreground/30 bg-card hover:border-primary hover:shadow-sm"
                  }`}
                aria-label={
                  task.isCompleted
                    ? `Marquer la tâche ${task.taskTemplate.title} comme en attente`
                    : `Marquer la tâche ${task.taskTemplate.title} comme faite`
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
                  className={`text-sm font-medium ${task.isCompleted
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                    }`}
                >
                  {task.taskTemplate.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.employee
                    ? `Assignée à ${task.employee.name}`
                    : "Non assignée"}
                </p>
                {task.completedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Terminée à {formatTime(task.completedAt)}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section >
  );
}

export default function TodayBoard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: board, isLoading } = useManagerTodayBoardQuery();
  const updateDailyTask = useUpdateDailyTaskMutation();

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
      toastError(
        getErrorMessage(
          error,
          "Échec de la mise à jour de la tâche. Merci de réessayer.",
        ),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-primary/5 to-background p-4 flex flex-col animate-pulse">
        <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-full min-h-[300px] sm:min-h-[500px] bg-card/50 backdrop-blur-md rounded-xl border border-border/40 p-4 space-y-4">
              <div className="h-6 w-32 bg-secondary/50 rounded-md"></div>
              <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
              <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
              <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 animate-fade-in-up">
        <div className="glass-card w-full max-w-md rounded-2xl border border-border/50 bg-card/80 p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Loader2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            Équipe introuvable
          </h1>
          <p className="mt-3 text-sm text-muted-foreground mb-8">
            Merci de contacter votre administrateur.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
          >
            <LogOut className="h-5 w-5" />
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col p-4 w-full">
      <main className="w-full space-y-6 flex-1">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 max-w-[1600px] mx-auto w-full h-full align-top">
          <TaskSection
            title="En retard"
            accentClass="border-l-4 border-l-red-500"
            emptyMessage="Aucune tâche en retard."
            tasks={sortedOverdue}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Aujourd'hui"
            accentClass="border-l-4 border-l-amber-500"
            emptyMessage="Aucune tâche en attente pour aujourd'hui."
            tasks={sortedToday}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Terminées"
            accentClass="border-l-4 border-l-emerald-500"
            emptyMessage="Aucune tâche terminée pour l'instant."
            tasks={sortedCompletedToday}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
        </div>
      </main>
    </div>
  );
}
