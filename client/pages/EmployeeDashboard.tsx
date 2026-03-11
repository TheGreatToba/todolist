import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/hooks/useSocket";
import {
  useDailyTasksQuery,
  useUpdateDailyTaskMutation,
  queryKeys,
} from "@/hooks/queries";
import {
  Check,
  Loader2,
  LogOut,
  Calendar,
  ListTodo,
  Settings,
} from "lucide-react";
import { logger } from "@/lib/logger";
import { toastError, toastSuccess } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { todayLocalISO, isToday, formatTaskDateLabel } from "@/lib/date-utils";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import { Badge } from "@/components/ui/badge";

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const { on } = useSocket();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayLocalISO(),
  );
  const [activeTab, setActiveTab] = useState<"tasks" | "settings">("tasks");

  const { data: tasks = [], isLoading } = useDailyTasksQuery(selectedDate);
  const updateTask = useUpdateDailyTaskMutation();

  useEffect(() => {
    const unsubscribeUpdate = on("task:updated", (data) => {
      logger.debug("Task updated:", data);
      if (isToday(selectedDate)) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.daily(selectedDate),
        });
      }
    });

    const unsubscribeAssigned = on("task:assigned", (data) => {
      if (data.employeeId === user?.id) {
        logger.debug("New task assigned:", data);
        const title = (data.taskTitle ?? "").trim() || "New task assigned";
        const description = (data.taskDescription ?? "").trim() || undefined;
        toastSuccess(title, description);
        if (!data.taskDate || data.taskDate === selectedDate) {
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.tasks.daily(selectedDate),
            });
          }, 500);
        }
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, user?.id, selectedDate, queryClient]);

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    try {
      await updateTask.mutateAsync({ taskId, isCompleted: !isCompleted });
    } catch (error) {
      logger.error("Echec de mise a jour de la tache:", error);
      toastError(
        getErrorMessage(
          error,
          "Echec de la mise a jour de la tache. Reessayez.",
        ),
      );
    }
  };

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const totalCount = tasks.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-500/5 to-background pb-24 md:pb-8 relative">
      {/* Header */}
      <div className="bg-card sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-9 w-9 rounded-lg object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-foreground truncate">
                  {formatTaskDateLabel(selectedDate)}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Bienvenue, {user?.name}
                  <span className="sr-only">Welcome, {user?.name}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" aria-hidden />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pink-500"
                  aria-label="Select date"
                />
              </label>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
                title="Se déconnecter"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="hidden md:flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all ${
                activeTab === "tasks"
                  ? "bg-pink-500 text-white shadow-md"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              <ListTodo className="w-4 h-4" />
              <span>Tâches</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all ${
                activeTab === "settings"
                  ? "bg-pink-500 text-white shadow-md"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Paramètres</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Navigation */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 bg-background/80 backdrop-blur-xl border-none shadow-2xl rounded-3xl z-50 p-2 flex items-center justify-around gap-2">
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex items-center justify-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 flex-1 ${
            activeTab === "tasks"
              ? "bg-pink-500 text-white shadow-md"
              : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          }`}
        >
          <ListTodo
            className={`w-6 h-6 flex-shrink-0 ${activeTab === "tasks" ? "" : "opacity-80"}`}
          />
          {activeTab === "tasks" && (
            <span className="font-semibold text-sm whitespace-nowrap animate-in fade-in zoom-in duration-300">
              Tâches
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center justify-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 flex-1 ${
            activeTab === "settings"
              ? "bg-pink-500 text-white shadow-md"
              : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          }`}
        >
          <Settings
            className={`w-6 h-6 flex-shrink-0 ${activeTab === "settings" ? "" : "opacity-80"}`}
          />
          {activeTab === "settings" && (
            <span className="font-semibold text-sm whitespace-nowrap animate-in fade-in zoom-in duration-300">
              Paramètres
            </span>
          )}
        </button>
      </div>

      {activeTab === "tasks" && (
        <>
          {/* Progress Card */}
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {isToday(selectedDate)
                      ? "Progression du jour"
                      : `Progression du ${new Date(
                          selectedDate + "T12:00:00",
                        ).toLocaleDateString()}`}
                    {isToday(selectedDate) && (
                      <span className="sr-only">Today's Progress</span>
                    )}
                  </p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {completedCount}
                    <span className="text-lg text-muted-foreground">
                      /{totalCount}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-pink-500">
                    {progressPercent}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Terminé</p>
                </div>
              </div>
              <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-pink-500 to-pink-400 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="max-w-2xl mx-auto px-4 pb-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
                  <Check className="w-8 h-8 text-pink-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Toutes les tâches sont terminées !
                </h3>
                <p className="text-muted-foreground">
                  {isToday(selectedDate)
                    ? "Bravo ! Vous avez terminé toutes vos tâches pour aujourd'hui."
                    : `Aucune tâche pour le ${new Date(
                        selectedDate + "T12:00:00",
                      ).toLocaleDateString()}.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-card rounded-xl border p-3 sm:p-4 transition-all shadow-sm ${
                      task.isCompleted
                        ? "bg-pink-50 border-pink-300/40 shadow-pink-100/50"
                        : "border-border hover:border-pink-500/50 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() =>
                          handleToggleTask(task.id, task.isCompleted)
                        }
                        disabled={
                          updateTask.isPending &&
                          updateTask.variables?.taskId === task.id
                        }
                        className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                          task.isCompleted
                            ? "bg-pink-500 border-pink-500"
                            : "border-border hover:border-pink-500 bg-background"
                        } disabled:opacity-50`}
                      >
                        {updateTask.isPending &&
                        updateTask.variables?.taskId === task.id ? (
                          <Loader2 className="w-5 h-5 text-pink-500 animate-spin" />
                        ) : task.isCompleted ? (
                          <Check className="w-5 h-5 text-white" />
                        ) : null}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h3
                              className={`font-semibold transition-all ${
                                task.isCompleted
                                  ? "text-muted-foreground line-through"
                                  : "text-foreground"
                              }`}
                            >
                              {task.taskTemplate.title}
                            </h3>
                            <div className="mt-1">
                              <Badge
                                variant="secondary"
                                className="text-[10px] uppercase"
                              >
                                {task.taskTemplate.isRecurring
                                  ? "Recurring"
                                  : "One-shot"}
                              </Badge>
                            </div>
                            {task.taskTemplate.description && (
                              <p
                                className={`text-sm mt-1 ${
                                  task.isCompleted
                                    ? "text-muted-foreground/60"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {task.taskTemplate.description}
                              </p>
                            )}
                            {task.taskTemplate.workstation && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Poste : {task.taskTemplate.workstation.name}
                              </p>
                            )}
                          </div>
                          {task.completedAt && (
                            <div className="text-xs text-pink-500 font-medium flex-shrink-0">
                              Fait
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "settings" && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Mon compte
            </h2>
            <AccountSettingsForm user={user} />
          </div>
        </div>
      )}
    </div>
  );
}
