import React from "react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import { todayLocalISO } from "@/lib/date-utils";
import { TasksSummaryCards } from "./TasksSummaryCards";
import { TasksProgressBar } from "./TasksProgressBar";
import { TasksDateFilters } from "./TasksDateFilters";
import { TasksByWorkstationList } from "./TasksByWorkstationList";
import { buildTasksByWorkstation, type TeamMember } from "./types";
import { trackManagerKpiEvent } from "@/lib/metrics";

interface TasksTabProps {
  dashboard: ManagerDashboardType;
  teamMembers: TeamMember[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedEmployee: string | null;
  setSelectedEmployee: (id: string | null) => void;
  selectedWorkstation: string | null;
  setSelectedWorkstation: (id: string | null) => void;
  onExportCsv: () => void;
  onNewTask: () => void;
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  onReassignTask: (taskId: string, employeeId: string) => void;
  onPrepareAssign: (templateId: string, employeeId: string) => void;
  isPrepareAssigning?: boolean;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
  onBatchAssignTasks: (taskIds: string[], employeeId: string) => void;
  onBatchUnassignTasks: (taskIds: string[]) => void;
  isBatchUpdatingTasks?: boolean;
}

export function TasksTab({
  dashboard,
  teamMembers,
  selectedDate,
  setSelectedDate,
  selectedEmployee,
  setSelectedEmployee,
  selectedWorkstation,
  setSelectedWorkstation,
  onExportCsv,
  onNewTask,
  onToggleTask,
  onReassignTask,
  onPrepareAssign,
  isPrepareAssigning = false,
  pendingTaskId,
  isTaskUpdating = false,
  onBatchAssignTasks,
  onBatchUnassignTasks,
  isBatchUpdatingTasks = false,
}: TasksTabProps) {
  const filteredTasks = dashboard.dailyTasks;
  const [showPreparePanel, setShowPreparePanel] = React.useState(false);
  const [selectedEmployeeByTemplate, setSelectedEmployeeByTemplate] =
    React.useState<Record<string, string>>({});
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [batchEmployeeId, setBatchEmployeeId] = React.useState<string>("");
  const [isMultiSelectMode, setIsMultiSelectMode] =
    React.useState<boolean>(false);
  const completedCount = filteredTasks.filter((t) => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const recurringCount = filteredTasks.filter(
    (t) => t.taskTemplate.isRecurring,
  ).length;
  const oneShotCount = totalCount - recurringCount;
  const recurringToAssign =
    dashboard.dayPreparation?.recurringUnassignedCount ?? 0;
  const dayPrepared =
    dashboard.dayPreparation?.isPrepared ?? recurringToAssign === 0;
  const now = new Date();
  const isTodaySelected = selectedDate === todayLocalISO();
  const showLateOpeningWarning =
    !dayPrepared && isTodaySelected && now.getHours() >= 14;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const tasksByWorkstation = buildTasksByWorkstation(filteredTasks);
  const unassignedRecurringTemplates =
    dashboard.dayPreparation?.unassignedRecurringTemplates ?? [];

  const prepareStartRef = React.useRef<number | null>(null);
  const lastPrepareDateRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setSelectedTaskIds([]);
    setBatchEmployeeId("");
    setIsMultiSelectMode(false);
  }, [selectedDate, selectedEmployee, selectedWorkstation]);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  React.useEffect(() => {
    if (unassignedRecurringTemplates.length === 0) return;
    setSelectedEmployeeByTemplate((prev) => {
      const next = { ...prev };
      for (const item of unassignedRecurringTemplates) {
        if (next[item.templateId]) continue;
        const defaultEmployeeId =
          item.defaultEmployeeId ?? item.suggestedEmployees[0]?.id;
        if (defaultEmployeeId) {
          next[item.templateId] = defaultEmployeeId;
        }
      }
      return next;
    });
  }, [unassignedRecurringTemplates]);

  React.useEffect(() => {
    if (!showPreparePanel) return;
    if (!dayPrepared) return;
    if (!prepareStartRef.current) return;
    const durationMs = Date.now() - prepareStartRef.current;
    trackManagerKpiEvent("manager.prepare_day_completed", {
      date: lastPrepareDateRef.current ?? selectedDate,
      durationMs,
      recurringToAssign,
      recurringTemplatesTotal: recurringCount,
    });
    prepareStartRef.current = null;
    lastPrepareDateRef.current = null;
  }, [
    dayPrepared,
    showPreparePanel,
    selectedDate,
    recurringToAssign,
    recurringCount,
  ]);

  return (
    <>
      <TasksSummaryCards
        teamMembersCount={teamMembers.length}
        totalTasks={totalCount}
        progressPercent={progressPercent}
        oneShotCount={oneShotCount}
        recurringCount={recurringCount}
        recurringToAssign={recurringToAssign}
        dayPrepared={dayPrepared}
        showLateOpeningWarning={showLateOpeningWarning}
        onPrepareMyDay={() =>
          setShowPreparePanel((prev) => {
            const next = !prev;
            if (next) {
              prepareStartRef.current = Date.now();
              lastPrepareDateRef.current = selectedDate;
              trackManagerKpiEvent("manager.prepare_day_started", {
                date: selectedDate,
                recurringToAssign,
                recurringTemplatesTotal: recurringCount,
              });
            } else if (prev && !next && prepareStartRef.current) {
              const durationMs = Date.now() - prepareStartRef.current;
              trackManagerKpiEvent("manager.prepare_day_cancelled", {
                date: lastPrepareDateRef.current ?? selectedDate,
                durationMs,
                recurringToAssign,
                recurringTemplatesTotal: recurringCount,
              });
              prepareStartRef.current = null;
              lastPrepareDateRef.current = null;
            }
            return next;
          })
        }
      />

      <TasksProgressBar
        completedCount={completedCount}
        totalCount={totalCount}
        progressPercent={progressPercent}
      />

      <TasksDateFilters
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        selectedEmployee={selectedEmployee}
        onEmployeeChange={setSelectedEmployee}
        selectedWorkstation={selectedWorkstation}
        onWorkstationChange={setSelectedWorkstation}
        teamMembers={teamMembers}
        workstations={dashboard.workstations}
        onExportCsv={onExportCsv}
        onNewTask={onNewTask}
        isMultiSelectMode={isMultiSelectMode}
        onToggleMultiSelect={() => {
          setIsMultiSelectMode((prev) => {
            const next = !prev;
            if (!next) {
              setSelectedTaskIds([]);
              setBatchEmployeeId("");
            }
            return next;
          });
        }}
      />

      {isMultiSelectMode && selectedTaskIds.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-foreground">
            {selectedTaskIds.length} task
            {selectedTaskIds.length > 1 ? "s" : ""} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batchEmployeeId}
              onChange={(e) => setBatchEmployeeId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              disabled={isBatchUpdatingTasks}
              aria-label="Select employee for batch assignment"
            >
              <option value="">Select employee…</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!batchEmployeeId) return;
                onBatchAssignTasks(selectedTaskIds, batchEmployeeId);
                trackManagerKpiEvent("manager.batch_update_daily_tasks", {
                  mode: "assign_or_reassign",
                  taskCount: selectedTaskIds.length,
                  employeeId: batchEmployeeId,
                  date: selectedDate,
                  source: "tasks_tab",
                });
              }}
              disabled={
                !batchEmployeeId ||
                isBatchUpdatingTasks ||
                selectedTaskIds.length === 0
              }
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              Assigner / Reaffecter
            </button>
            <button
              type="button"
              onClick={() => onBatchUnassignTasks(selectedTaskIds)}
              disabled={isBatchUpdatingTasks || selectedTaskIds.length === 0}
              className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              Unassign
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedTaskIds([]);
                setBatchEmployeeId("");
              }}
              className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary/60"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {showPreparePanel && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-foreground">
              Prepare my day
            </h3>
            <p className="text-sm text-muted-foreground">
              Assigner les taches recurrentes du jour.
            </p>
          </div>
          {unassignedRecurringTemplates.length === 0 ? (
            <p className="text-sm text-emerald-600">
              All recurring tasks are assigned.
            </p>
          ) : (
            <div className="space-y-3">
              {unassignedRecurringTemplates.map((item) => {
                const selectedEmployeeId =
                  selectedEmployeeByTemplate[item.templateId] ?? "";
                const hasChoices = item.suggestedEmployees.length > 0;
                return (
                  <div
                    key={item.templateId}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.workstation
                          ? `Poste : ${item.workstation.name}`
                          : "Modele direct"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedEmployeeId}
                        disabled={!hasChoices || isPrepareAssigning}
                        onChange={(e) =>
                          setSelectedEmployeeByTemplate((prev) => ({
                            ...prev,
                            [item.templateId]: e.target.value,
                          }))
                        }
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                        aria-label={`Select employee for ${item.title}`}
                      >
                        {!hasChoices && <option value="">No suggestion</option>}
                        {item.suggestedEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedEmployeeId || isPrepareAssigning}
                        onClick={() => {
                          const defaultEmployeeId =
                            item.defaultEmployeeId ??
                            item.suggestedEmployees[0]?.id ??
                            null;
                          const usedSuggested =
                            !!defaultEmployeeId &&
                            selectedEmployeeId === defaultEmployeeId;
                          trackManagerKpiEvent(
                            "manager.prepare_day_assignment",
                            {
                              date: selectedDate,
                              templateId: item.templateId,
                              assignedEmployeeId: selectedEmployeeId,
                              defaultEmployeeId,
                              usedSuggested,
                            },
                          );
                          onPrepareAssign(item.templateId, selectedEmployeeId);
                        }}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Assigner
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <TasksByWorkstationList
        tasksByWorkstation={tasksByWorkstation}
        teamMembers={teamMembers}
        onToggleTask={onToggleTask}
        onReassignTask={onReassignTask}
        pendingTaskId={pendingTaskId}
        isTaskUpdating={isTaskUpdating}
        selectedTaskIds={selectedTaskIds}
        onToggleTaskSelection={toggleTaskSelection}
        isMultiSelectMode={isMultiSelectMode}
      />
    </>
  );
}
