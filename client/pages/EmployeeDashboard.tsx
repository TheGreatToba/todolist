import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/hooks/useSocket";
import {
  useDailyTasksQuery,
  useUpdateDailyTaskMutation,
  queryKeys,
} from "@/hooks/queries";
import { Check, Loader2, LogOut, Calendar } from "lucide-react";
import { logger } from "@/lib/logger";
import { toastError, toastSuccess } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { todayLocalISO, isToday, formatTaskDateLabel } from "@/lib/date-utils";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";

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
      logger.error("Failed to update task:", error);
      toastError(
        getErrorMessage(error, "Failed to update task. Please try again."),
      );
    }
  };

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const totalCount = tasks.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {formatTaskDateLabel(selectedDate)}
              </h1>
              <p className="text-sm text-muted-foreground">
                Welcome, {user?.name}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" aria-hidden />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Select date"
                />
              </label>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-4 border-t border-border pt-4 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`px-3 py-1.5 font-medium transition border-b-2 ${
                activeTab === "tasks"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Tasks
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`px-3 py-1.5 font-medium transition border-b-2 ${
                activeTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {activeTab === "tasks" && (
        <>
          {/* Progress Card */}
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {isToday(selectedDate)
                      ? "Today's Progress"
                      : `Progress for ${new Date(selectedDate + "T12:00:00").toLocaleDateString()}`}
                  </p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {completedCount}
                    <span className="text-lg text-muted-foreground">
                      /{totalCount}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-primary">
                    {progressPercent}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Complete</p>
                </div>
              </div>
              <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-primary/80 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tasks List */}
          <div className="max-w-2xl mx-auto px-4 pb-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  All tasks completed!
                </h3>
                <p className="text-muted-foreground">
                  {isToday(selectedDate)
                    ? "Great job! You've finished all your tasks for today."
                    : `No tasks for ${new Date(selectedDate + "T12:00:00").toLocaleDateString()}.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-card rounded-xl border border-border p-4 transition-all ${
                      task.isCompleted
                        ? "bg-secondary/30 border-primary/20"
                        : "hover:border-primary/50"
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
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-1 ${
                          task.isCompleted
                            ? "bg-primary border-primary"
                            : "border-border hover:border-primary bg-background"
                        } disabled:opacity-50`}
                      >
                        {updateTask.isPending &&
                        updateTask.variables?.taskId === task.id ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : task.isCompleted ? (
                          <Check className="w-4 h-4 text-primary-foreground" />
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
                                WS: {task.taskTemplate.workstation.name}
                              </p>
                            )}
                          </div>
                          {task.completedAt && (
                            <div className="text-xs text-primary font-medium flex-shrink-0">
                              Done
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
              My account
            </h2>
            <AccountSettingsForm user={user} />
          </div>
        </div>
      )}
    </div>
  );
}
