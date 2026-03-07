import React from "react";
import type { TodayBoardTask } from "@shared/api";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerTodayBoardQuery,
  useUpdateDailyTaskMutation,
} from "@/hooks/queries";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";

type TaskStatus = "done" | "pending" | "overdue";

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatus(task: TodayBoardTask, overdueIds: Set<string>): TaskStatus {
  if (task.isCompleted) return "done";
  if (overdueIds.has(task.id)) return "overdue";
  return "pending";
}

export default function TodayBoard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: board, isLoading } = useManagerTodayBoardQuery();
  const updateDailyTask = useUpdateDailyTaskMutation();
  const [selectedWorkstationId, setSelectedWorkstationId] = React.useState<
    string | null
  >(null);

  const overdueIds = React.useMemo(
    () => new Set((board?.overdue ?? []).map((t) => t.id)),
    [board?.overdue],
  );

  const allTasks = React.useMemo(() => {
    const map = new Map<string, TodayBoardTask>();
    for (const list of [
      board?.today ?? [],
      board?.completedToday ?? [],
      board?.overdue ?? [],
    ]) {
      for (const task of list) {
        if (!map.has(task.id)) map.set(task.id, task);
      }
    }
    return [...map.values()].sort(
      (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
    );
  }, [board?.today, board?.completedToday, board?.overdue]);

  const workstations = React.useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; name: string; tasks: TodayBoardTask[] }
    >();

    for (const task of allTasks) {
      const id = task.taskTemplate.workstation?.id ?? "__direct__";
      const name = task.taskTemplate.workstation?.name ?? "Affectation directe";
      const existing = grouped.get(id);
      if (existing) {
        existing.tasks.push(task);
      } else {
        grouped.set(id, { id, name, tasks: [task] });
      }
    }

    return [...grouped.values()]
      .map((group) => {
        const done = group.tasks.filter((task) => task.isCompleted).length;
        const progress =
          group.tasks.length > 0
            ? Math.round((done / group.tasks.length) * 100)
            : 0;
        return {
          ...group,
          done,
          progress,
          pending: group.tasks.filter(
            (task) => getStatus(task, overdueIds) === "pending",
          ).length,
          overdue: group.tasks.filter(
            (task) => getStatus(task, overdueIds) === "overdue",
          ).length,
        };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [allTasks, overdueIds]);

  const selectedWorkstation = React.useMemo(
    () =>
      workstations.find((item) => item.id === selectedWorkstationId) ?? null,
    [workstations, selectedWorkstationId],
  );

  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((task) => task.isCompleted).length;
  const globalProgress =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

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
      <div className="min-h-[calc(100vh-4rem)] bg-[#FAFAFA] p-4 animate-pulse">
        <div className="h-40 rounded-2xl bg-[#FFE0F0] mb-5" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-white border border-border/50"
            />
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
    <div className="min-h-[calc(100vh-4rem)] bg-[#FAFAFA] text-[#1A1A2E] w-full">
      <div className="space-y-5">
        <section className="rounded-3xl bg-gradient-to-br from-[#E91E8C] to-[#FF85C2] p-5 text-white shadow-lg">
          <p className="text-xs uppercase tracking-[0.2em] text-white/85">
            Aujourd&apos;hui
          </p>
          <h1 className="mt-2 text-2xl font-bold">Résumé de la journée</h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
              <p className="text-[11px] text-white/80">Tâches</p>
              <p className="text-2xl font-bold">{totalTasks}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
              <p className="text-[11px] text-white/80">Progression</p>
              <p className="text-2xl font-bold">{globalProgress}%</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${globalProgress}%` }}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {workstations.map((workstation) => (
            <button
              key={workstation.id}
              type="button"
              onClick={() => setSelectedWorkstationId(workstation.id)}
              className="w-full text-left rounded-2xl border border-[#F4D3E6] bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#1A1A2E]">
                    {workstation.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {workstation.tasks.length} tâche
                    {workstation.tasks.length > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#E91E8C]">
                  {workstation.progress}%
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[#FFE0F0] overflow-hidden">
                <div
                  className="h-full bg-[#E91E8C]"
                  style={{ width: `${workstation.progress}%` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px]">
                <span className="rounded-full bg-[#22C55E] px-2 py-0.5 font-semibold text-white">
                  {workstation.done} done
                </span>
                <span className="rounded-full bg-[#F97316] px-2 py-0.5 font-semibold text-white">
                  {workstation.pending} pending
                </span>
                <span className="rounded-full bg-[#EF4444] px-2 py-0.5 font-semibold text-white">
                  {workstation.overdue} overdue
                </span>
              </div>
            </button>
          ))}
        </section>
      </div>

      {selectedWorkstation && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setSelectedWorkstationId(null)}
            aria-label="Fermer le panneau"
          />
          <div className="absolute inset-0 bg-white animate-fade-in-up overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#1A1A2E]">
                  {selectedWorkstation.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedWorkstation.tasks.length} tâche
                  {selectedWorkstation.tasks.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWorkstationId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FFE0F0] text-[#E91E8C]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 pb-8 space-y-3">
              {selectedWorkstation.tasks.map((task) => {
                const status = getStatus(task, overdueIds);
                return (
                  <article
                    key={task.id}
                    className="rounded-2xl border border-[#F4D3E6] bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleTask(task)}
                        disabled={
                          updateDailyTask.isPending &&
                          updateDailyTask.variables?.taskId === task.id
                        }
                        className={`mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                          task.isCompleted
                            ? "border-[#E91E8C] bg-[#E91E8C]"
                            : "border-slate-300"
                        }`}
                      >
                        {task.isCompleted && (
                          <svg
                            className="h-3 w-3 text-white"
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
                          className={`text-sm font-semibold ${task.isCompleted ? "line-through text-slate-400" : "text-[#1A1A2E]"}`}
                        >
                          {task.taskTemplate.title}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] font-semibold">
                          {status === "done" && (
                            <span className="rounded-full bg-[#22C55E] px-2 py-0.5 text-white">
                              done
                            </span>
                          )}
                          {status === "pending" && (
                            <span className="rounded-full bg-[#F97316] px-2 py-0.5 text-white">
                              pending
                            </span>
                          )}
                          {status === "overdue" && (
                            <span className="rounded-full bg-[#EF4444] px-2 py-0.5 text-white">
                              overdue
                            </span>
                          )}
                          {typeof task.priorityScore === "number" && (
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                task.priorityScore >= 80
                                  ? "bg-red-100 text-red-700"
                                  : task.priorityScore >= 50
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              Priorité {task.priorityScore}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {task.employee
                            ? `Assignée à ${task.employee.name}`
                            : "Non assignée"}
                        </p>
                        {task.completedAt && (
                          <p className="mt-1 text-xs text-slate-500">
                            Terminée à {formatTime(task.completedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
