import React from "react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import { todayLocalISO } from "@/lib/date-utils";
import { TasksSummaryCards } from "./TasksSummaryCards";
import { TasksProgressBar } from "./TasksProgressBar";
import { TasksDateFilters } from "./TasksDateFilters";
import { TasksByWorkstationList } from "./TasksByWorkstationList";
import { buildTasksByWorkstation, type TeamMember } from "./types";

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
}: TasksTabProps) {
  const filteredTasks = dashboard.dailyTasks;
  const [showPreparePanel, setShowPreparePanel] = React.useState(false);
  const [selectedEmployeeByTemplate, setSelectedEmployeeByTemplate] =
    React.useState<Record<string, string>>({});
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
        onPrepareMyDay={() => setShowPreparePanel((prev) => !prev)}
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
      />

      {showPreparePanel && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-foreground">
              Prepare my day
            </h3>
            <p className="text-sm text-muted-foreground">
              Assign today&apos;s recurring tasks.
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
                          ? `Workstation: ${item.workstation.name}`
                          : "Direct template"}
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
                        onClick={() =>
                          onPrepareAssign(item.templateId, selectedEmployeeId)
                        }
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Assign
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
      />
    </>
  );
}
