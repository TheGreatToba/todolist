import React, { useMemo, useState } from "react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import type { PilotageAction } from "@shared/api";
import type { TeamMember, TodayBoardTask } from "@shared/api";
import { useManagerDashboardQuery } from "@/hooks/queries";
import { useManagerTodayBoardQuery } from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { DIRECT_ASSIGNMENTS_ID } from "./types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  UserX,
  Users,
  Building2,
  ListChecks,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

type DashboardTask = ManagerDashboardType["dailyTasks"][number];

interface PilotageTabProps {
  /** Quand fourni, suivi par date (page Pilotage dédiée). Sinon = aujourd'hui (intégré au tableau de bord). */
  selectedDate?: string;
  teamMembers: TeamMember[];
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onBatchAssignTasks: (taskIds: string[], employeeId: string) => void;
  onGoToTasksWithFilters: (options: {
    employeeId?: string | null;
    workstationId?: string | null;
  }) => void;
  isBatchUpdatingTasks?: boolean;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
}

function buildTopActions(
  overdueCount: number,
  unassignedCount: number,
  overloadedCount: number,
  hotWorkstationsCount: number,
): PilotageAction[] {
  const actions: PilotageAction[] = [];
  if (unassignedCount > 0) {
    actions.push({
      id: "assign-unassigned",
      label: `Assigner ${unassignedCount} tâche(s) non assignée(s)`,
      kind: "assign",
      priorityScore: 90,
    });
  }
  if (overdueCount > 0) {
    actions.push({
      id: "review-overdue",
      label: `Examiner ${overdueCount} tâche(s) en retard`,
      kind: "view",
      priorityScore: 85,
    });
  }
  if (overloadedCount > 0) {
    actions.push({
      id: "rebalance-overloaded",
      label: `Rééquilibrer la charge de ${overloadedCount} employé(s) surchargé(s)`,
      kind: "rebalance",
      priorityScore: 70,
    });
  }
  if (hotWorkstationsCount > 0) {
    actions.push({
      id: "view-hot-workstations",
      label: `Analyser ${hotWorkstationsCount} poste(s) en tension`,
      kind: "view",
      priorityScore: 65,
    });
  }
  return actions.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);
}

function computeOverloadedEmployees(dailyTasks: DashboardTask[]): Array<{
  employeeId: string;
  name: string;
  taskCount: number;
  threshold: number;
}> {
  const assigned = dailyTasks.filter(
    (t) =>
      (t as { employeeId?: string | null }).employeeId &&
      (t as DashboardTask).employee,
  ) as Array<DashboardTask & { employeeId: string }>;
  const byEmployee = assigned.reduce<Record<string, DashboardTask[]>>(
    (acc, t) => {
      const id = t.employeeId ?? t.employee.id;
      if (!acc[id]) acc[id] = [];
      acc[id].push(t);
      return acc;
    },
    {},
  );
  const counts = Object.entries(byEmployee).map(([id, tasks]) => ({
    employeeId: id,
    name: tasks[0].employee.name,
    taskCount: tasks.length,
  }));
  if (counts.length === 0) return [];
  const mean = counts.reduce((s, c) => s + c.taskCount, 0) / counts.length;
  // Seuil surcharge : au-dessus de la moyenne (ceil(mean) + 1)
  const threshold = Math.ceil(mean) + 1;
  return counts
    .filter((c) => c.taskCount >= threshold)
    .map((c) => ({ ...c, threshold }));
}

function computeHotWorkstations(
  dailyTasks: DashboardTask[],
): Array<{ workstationId: string; name: string; uncompletedCount: number }> {
  const uncompleted = dailyTasks.filter((t) => !t.isCompleted);
  const byWs = uncompleted.reduce<
    Record<string, { name: string; uncompletedCount: number }>
  >((acc, t) => {
    const id = t.taskTemplate.workstation?.id ?? DIRECT_ASSIGNMENTS_ID;
    const name = t.taskTemplate.workstation?.name ?? "Affectation directe";
    if (!acc[id]) acc[id] = { name, uncompletedCount: 0 };
    acc[id].uncompletedCount += 1;
    return acc;
  }, {});
  const total = uncompleted.length;
  const avg =
    Object.keys(byWs).length > 0 ? total / Object.keys(byWs).length : 0;
  return Object.entries(byWs)
    .filter(
      ([, v]) =>
        v.uncompletedCount >= Math.ceil(avg) && v.uncompletedCount >= 2,
    )
    .map(([workstationId, v]) => ({
      workstationId,
      name: v.name,
      uncompletedCount: v.uncompletedCount,
    }));
}

export function PilotageTab({
  selectedDate: selectedDateProp,
  teamMembers,
  onToggleTask,
  onBatchAssignTasks,
  onGoToTasksWithFilters,
  isBatchUpdatingTasks = false,
  pendingTaskId,
  isTaskUpdating = false,
}: PilotageTabProps) {
  const today = todayLocalISO();
  const selectedDate = selectedDateProp ?? today;
  const isToday = selectedDate === today;

  const { data: dashboard, isLoading: dashboardLoading } =
    useManagerDashboardQuery({ date: selectedDate });
  const { data: todayBoard, isLoading: todayBoardLoading } =
    useManagerTodayBoardQuery(undefined, { enabled: isToday });

  const [batchEmployeeId, setBatchEmployeeId] = useState("");
  const [selectedOverdueIds, setSelectedOverdueIds] = useState<string[]>([]);
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<string[]>(
    [],
  );

  const unassignedTasks = useMemo(() => {
    if (!dashboard?.dailyTasks) return [];
    const list = dashboard.dailyTasks.filter(
      (t) => !(t as { employeeId?: string | null }).employeeId,
    ) as DashboardTask[];
    return [...list].sort(
      (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
    );
  }, [dashboard?.dailyTasks]);

  /** Tâches en retard : soit todayBoard (aujourd'hui, avec détail), soit dashboard.attention (autre date, liste résumée). */
  const overdueCritical = useMemo(() => {
    if (isToday && todayBoard?.overdue) {
      return [...todayBoard.overdue].sort(
        (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
      );
    }
    return dashboard?.attention?.overdueCritical ?? [];
  }, [isToday, todayBoard?.overdue, dashboard?.attention?.overdueCritical]);
  const overdueIsFullTasks = isToday && todayBoard?.overdue != null;

  const overloadedEmployees = useMemo(
    () =>
      dashboard?.dailyTasks
        ? computeOverloadedEmployees(dashboard.dailyTasks)
        : [],
    [dashboard?.dailyTasks],
  );

  const hotWorkstations = useMemo(
    () =>
      dashboard?.dailyTasks ? computeHotWorkstations(dashboard.dailyTasks) : [],
    [dashboard?.dailyTasks],
  );

  const topActions = useMemo(
    () =>
      buildTopActions(
        overdueCritical.length,
        unassignedTasks.length,
        overloadedEmployees.length,
        hotWorkstations.length,
      ),
    [
      overdueCritical.length,
      unassignedTasks.length,
      overloadedEmployees.length,
      hotWorkstations.length,
    ],
  );

  const toggleOverdueSelection = (taskId: string) => {
    setSelectedOverdueIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const toggleUnassignedSelection = (taskId: string) => {
    setSelectedUnassignedIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const handleBatchAssignUnassigned = () => {
    if (!batchEmployeeId || selectedUnassignedIds.length === 0) return;
    onBatchAssignTasks(selectedUnassignedIds, batchEmployeeId);
    setSelectedUnassignedIds([]);
  };

  const handleBatchAssignOverdue = () => {
    if (!batchEmployeeId || selectedOverdueIds.length === 0) return;
    onBatchAssignTasks(selectedOverdueIds, batchEmployeeId);
    setSelectedOverdueIds([]);
  };

  const isLoading = dashboardLoading || (isToday && todayBoardLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-muted-foreground text-sm">
          Chargement du pilotage…
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
        Aucune donnée de tableau de bord pour cette date.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {topActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListChecks className="h-5 w-5" />
              Actions prioritaires
            </CardTitle>
            <CardDescription>
              Prochaines étapes suggérées par ordre de priorité
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topActions.map((action) => {
                const getFilter = (): {
                  employeeId?: string | null;
                  workstationId?: string | null;
                } => {
                  if (
                    action.id === "rebalance-overloaded" &&
                    overloadedEmployees.length > 0
                  ) {
                    return { employeeId: overloadedEmployees[0].employeeId };
                  }
                  if (
                    action.id === "view-hot-workstations" &&
                    hotWorkstations.length > 0
                  ) {
                    const ws = hotWorkstations[0];
                    return {
                      workstationId:
                        ws.workstationId === DIRECT_ASSIGNMENTS_ID
                          ? "__direct__"
                          : ws.workstationId,
                    };
                  }
                  return {};
                };
                return (
                  <li key={action.id}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between font-normal"
                      onClick={() => onGoToTasksWithFilters(getFilter())}
                    >
                      <span>{action.label}</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Retards critiques
            </CardTitle>
            <CardDescription>
              {overdueIsFullTasks
                ? "Tâches en retard (date avant aujourd'hui, non terminées)"
                : "Tâches en retard pour cette date"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overdueCritical.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune tâche en retard.
              </p>
            ) : overdueIsFullTasks ? (
              <>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(overdueCritical as TodayBoardTask[]).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOverdueIds.includes(task.id)}
                        onChange={() => toggleOverdueSelection(task.id)}
                        className="h-4 w-4 rounded border-border text-primary"
                        aria-label={`Selectionner ${task.taskTemplate?.title ?? task.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {task.taskTemplate?.title ?? "Tache"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {task.taskTemplate?.workstation?.name ?? "—"} ·{" "}
                          {task.date?.slice(0, 10)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleTask(task.id, task.isCompleted)}
                        disabled={isTaskUpdating && pendingTaskId === task.id}
                        aria-label="Marquer comme faite"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {selectedOverdueIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                    <select
                      value={batchEmployeeId}
                      onChange={(e) => setBatchEmployeeId(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      disabled={isBatchUpdatingTasks}
                      aria-label="Sélectionner un employé pour l'affectation en lot"
                    >
                      <option value="">Choisir un employé…</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleBatchAssignOverdue}
                      disabled={!batchEmployeeId || isBatchUpdatingTasks}
                    >
                      Assigner la sélection
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onGoToTasksWithFilters({})}
                >
                  Ouvrir dans Tâches <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(
                    overdueCritical as Array<{
                      taskId: string;
                      title: string;
                      date: string;
                      workstationName?: string;
                    }>
                  ).map((item) => (
                    <div
                      key={item.taskId}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.workstationName ?? "—"} ·{" "}
                          {item.date?.slice(0, 10)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onGoToTasksWithFilters({})}
                >
                  Ouvrir dans Tâches <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserX className="h-5 w-5 text-amber-600" />
              Tâches non assignées
            </CardTitle>
            <CardDescription>
              Tâches du jour sans personne assignée
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unassignedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune tâche non assignée.
              </p>
            ) : (
              <>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {unassignedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUnassignedIds.includes(task.id)}
                        onChange={() => toggleUnassignedSelection(task.id)}
                        className="h-4 w-4 rounded border-border text-primary"
                        aria-label={`Selectionner ${task.taskTemplate.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {task.taskTemplate.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {task.taskTemplate.workstation?.name ??
                            "Affectation directe"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedUnassignedIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                    <select
                      value={batchEmployeeId}
                      onChange={(e) => setBatchEmployeeId(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      disabled={isBatchUpdatingTasks}
                      aria-label="Sélectionner un employé pour l'affectation en lot"
                    >
                      <option value="">Choisir un employé…</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleBatchAssignUnassigned}
                      disabled={!batchEmployeeId || isBatchUpdatingTasks}
                    >
                      Assigner la sélection
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onGoToTasksWithFilters({})}
                >
                  Ouvrir dans Tâches <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Surcharge par employé
            </CardTitle>
            <CardDescription>
              Employés avec un nombre de tâches supérieur à la moyenne
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overloadedEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun employé surchargé.
              </p>
            ) : (
              <ul className="space-y-2">
                {overloadedEmployees.map((emp) => (
                  <li key={emp.employeeId}>
                    <div className="flex items-center justify-between rounded-md border border-border p-2">
                      <span className="text-sm font-medium">{emp.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {emp.taskCount} tâche
                        {emp.taskCount !== 1 ? "s" : ""} (≥{emp.threshold})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-1"
                      onClick={() =>
                        onGoToTasksWithFilters({ employeeId: emp.employeeId })
                      }
                    >
                      Ouvrir dans Tâches{" "}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Postes en tension
            </CardTitle>
            <CardDescription>
              Postes avec beaucoup de tâches non terminées
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hotWorkstations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun poste en tension.
              </p>
            ) : (
              <ul className="space-y-2">
                {hotWorkstations.map((ws) => (
                  <li key={ws.workstationId}>
                    <div className="flex items-center justify-between rounded-md border border-border p-2">
                      <span className="text-sm font-medium">{ws.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {ws.uncompletedCount} non terminée
                        {ws.uncompletedCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-1"
                      onClick={() =>
                        onGoToTasksWithFilters({
                          workstationId:
                            ws.workstationId === DIRECT_ASSIGNMENTS_ID
                              ? "__direct__"
                              : ws.workstationId,
                        })
                      }
                    >
                      Ouvrir dans Tâches{" "}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
