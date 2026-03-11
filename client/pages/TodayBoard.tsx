import React, { useState } from "react";
import type { TodayBoardTask } from "@shared/api";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, X, Check, Clock, User, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerTodayBoardQuery,
  useUpdateDailyTaskMutation,
} from "@/hooks/queries";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { motion, AnimatePresence } from "framer-motion";

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
  onSelectTask,
  highlight = false,
}: {
  title: string;
  accentClass: string;
  emptyMessage: string;
  tasks: TodayBoardTask[];
  pendingTaskId: string | null;
  isTaskUpdating: boolean;
  onToggleTask: (task: TodayBoardTask) => void;
  onSelectTask: (task: TodayBoardTask) => void;
  highlight?: boolean;
}) {
  return (
    <section
      className={`glass-card flex flex-col overflow-hidden transition-all duration-300 ${accentClass} ${
        highlight
          ? "ring-2 ring-primary/25 shadow-2xl lg:scale-[1.02] z-10 bg-card/90"
          : "bg-card/70 shadow-lg"
      }`}
    >
      <header
        className={`flex items-center justify-between border-b border-border/60 px-5 py-4 backdrop-blur-sm ${
          highlight ? "bg-primary/8" : "bg-background/50"
        }`}
      >
        <h2
          className={`font-bold tracking-tight drop-shadow-sm ${
            highlight ? "text-xl text-primary" : "text-lg text-foreground"
          }`}
        >
          {title}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold shadow-inner ${
            highlight
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary"
          }`}
        >
          {tasks.length}
        </span>
      </header>
      <div className="space-y-3 p-4 flex-1 overflow-y-auto min-h-[150px]">
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-4 text-sm text-center text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        {tasks.map((task) => (
          <motion.article
            layoutId={`task-card-${task.id}`}
            key={task.id}
            onClick={() => onSelectTask(task)}
            className={`group relative cursor-pointer rounded-xl border bg-card/90 backdrop-blur-sm px-4 py-4 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:bg-card hover:border-primary/40 ${
              task.isCompleted
                ? "border-border/60 opacity-75"
                : "border-border shadow-sm"
            } ${highlight ? "border-primary/30 hover:border-primary/50 shadow-md" : ""}`}
          >
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTask(task);
                }}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 disabled:opacity-50 ${
                  task.isCompleted
                    ? "border-primary bg-primary shadow-[0_0_10px_rgba(233,30,99,0.5)]"
                    : "border-muted-foreground/30 bg-card hover:border-primary hover:shadow-sm"
                }`}
                aria-label={
                  task.isCompleted
                    ? `Mark task ${task.taskTemplate.title} as pending`
                    : `Mark task ${task.taskTemplate.title} as done`
                }
              >
                {task.isCompleted && (
                  <Check
                    className="h-3 w-3 text-primary-foreground"
                    strokeWidth={3}
                  />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <motion.p
                  layoutId={`task-title-${task.id}`}
                  className={`text-sm font-medium ${
                    task.isCompleted
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.taskTemplate.title}
                </motion.p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                    <User className="w-3 h-3" />
                    {task.employee ? task.employee.name : "Non assignée"}
                  </span>
                  {task.completedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />
                      {formatTime(task.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.article>
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
  const [selectedTask, setSelectedTask] = useState<TodayBoardTask | null>(null);

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
      return true;
    } catch (error) {
      toastError(
        getErrorMessage(
          error,
          "Échec de la mise à jour de la tâche. Merci de réessayer.",
        ),
      );
      return false;
    }
  };

  const closeTaskModal = () => setSelectedTask(null);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-primary/5 to-background p-4 flex flex-col animate-pulse">
        <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
          <div className="h-full min-h-[300px] sm:min-h-[500px] bg-card/50 backdrop-blur-md rounded-xl border border-border/40 p-4 space-y-4">
            <div className="h-6 w-32 bg-secondary/50 rounded-md"></div>
            <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
            <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
          </div>
          <div className="lg:col-span-2 h-full min-h-[400px] sm:min-h-[600px] bg-card/60 backdrop-blur-md rounded-xl border border-border/40 p-4 space-y-4 shadow-xl ring-2 ring-primary/20 lg:scale-[1.02] z-10">
            <div className="h-8 w-40 bg-secondary/50 rounded-md"></div>
            <div className="h-28 w-full bg-secondary/30 rounded-lg"></div>
            <div className="h-28 w-full bg-secondary/30 rounded-lg"></div>
            <div className="h-28 w-full bg-secondary/30 rounded-lg"></div>
          </div>
          <div className="h-full min-h-[300px] sm:min-h-[500px] bg-card/50 backdrop-blur-md rounded-xl border border-border/40 p-4 space-y-4">
            <div className="h-6 w-32 bg-secondary/50 rounded-md"></div>
            <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
            <div className="h-24 w-full bg-secondary/30 rounded-lg"></div>
          </div>
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
    <div className="min-h-[calc(100vh-4rem)] flex flex-col p-4 md:p-6 lg:p-8 w-full">
      <main className="w-full space-y-6 flex-1">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 max-w-[1600px] mx-auto w-full h-full items-start">
          <div className="lg:col-span-1">
            <TaskSection
              title="En retard"
              accentClass="border-t-4 border-t-red-500"
              emptyMessage="Aucune tâche en retard."
              tasks={sortedOverdue}
              pendingTaskId={updateDailyTask.variables?.taskId ?? null}
              isTaskUpdating={updateDailyTask.isPending}
              onToggleTask={handleToggleTask}
              onSelectTask={setSelectedTask}
            />
          </div>

          <div className="lg:col-span-2 relative z-10">
            <TaskSection
              title="Aujourd'hui"
              accentClass="border-t-4 border-t-amber-500"
              emptyMessage="Aucune tâche en attente pour aujourd'hui."
              tasks={sortedToday}
              pendingTaskId={updateDailyTask.variables?.taskId ?? null}
              isTaskUpdating={updateDailyTask.isPending}
              onToggleTask={handleToggleTask}
              onSelectTask={setSelectedTask}
              highlight={true}
            />
          </div>

          <div className="lg:col-span-1">
            <TaskSection
              title="Terminées"
              accentClass="border-t-4 border-t-emerald-500"
              emptyMessage="Aucune tâche terminée pour l'instant."
              tasks={sortedCompletedToday}
              pendingTaskId={updateDailyTask.variables?.taskId ?? null}
              isTaskUpdating={updateDailyTask.isPending}
              onToggleTask={handleToggleTask}
              onSelectTask={setSelectedTask}
            />
          </div>
        </div>
      </main>

      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12 pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeTaskModal}
              className="absolute inset-0 bg-background/80 backdrop-blur-md pointer-events-auto"
            />

            <motion.div
              layoutId={`task-card-${selectedTask.id}`}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-card rounded-3xl shadow-2xl border border-border/50 flex flex-col z-10 pointer-events-auto"
            >
              <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-card/90 backdrop-blur-sm border-b border-border/50">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                      selectedTask.isCompleted
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {selectedTask.isCompleted ? "Terminée" : "En cours"}
                  </span>
                  {selectedTask.priorityScore ? (
                    <span className="px-3 py-1 text-xs font-bold rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                      Priorité {selectedTask.priorityScore}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={closeTaskModal}
                  className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 sm:p-10 space-y-8 flex-1">
                <div>
                  <motion.h2
                    layoutId={`task-title-${selectedTask.id}`}
                    className="text-3xl sm:text-4xl font-black text-foreground tracking-tight"
                  >
                    {selectedTask.taskTemplate.title}
                  </motion.h2>
                  <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                    {selectedTask.taskTemplate.description ||
                      "Aucune description détaillée pour cette tâche."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/50 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Assignée à
                      </p>
                      <p className="font-bold text-foreground">
                        {selectedTask.employee
                          ? selectedTask.employee.name
                          : "Non assignée"}
                      </p>
                    </div>
                  </div>

                  {selectedTask.completedAt && (
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-600/70">
                          Terminée le
                        </p>
                        <p className="font-bold text-emerald-600">
                          {new Date(
                            selectedTask.completedAt,
                          ).toLocaleDateString()}{" "}
                          à {formatTime(selectedTask.completedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedTask.date && (
                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-amber-600/70">
                          Échéance
                        </p>
                        <p className="font-bold text-amber-600">
                          {new Date(selectedTask.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 z-20 p-6 bg-card/90 backdrop-blur-sm border-t border-border/50 flex flex-col sm:flex-row justify-end gap-4">
                <button
                  onClick={closeTaskModal}
                  className="px-6 py-3 rounded-xl font-bold text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                >
                  Fermer
                </button>
                <button
                  disabled={
                    updateDailyTask.isPending &&
                    updateDailyTask.variables?.taskId === selectedTask.id
                  }
                  onClick={async () => {
                    const didSucceed = await handleToggleTask(selectedTask);
                    if (didSucceed && !selectedTask.isCompleted) {
                      setTimeout(() => closeTaskModal(), 600);
                    }
                  }}
                  className={`px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    selectedTask.isCompleted
                      ? "bg-secondary text-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-primary/40"
                  }`}
                >
                  {updateDailyTask.isPending &&
                  updateDailyTask.variables?.taskId === selectedTask.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : selectedTask.isCompleted ? (
                    "Marquer comme en attente"
                  ) : (
                    <>
                      <Check className="w-5 h-5" strokeWidth={3} />
                      Valider la tâche
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
