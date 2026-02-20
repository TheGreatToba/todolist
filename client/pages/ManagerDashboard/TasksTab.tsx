import React from "react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
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
  pendingTaskId,
  isTaskUpdating = false,
}: TasksTabProps) {
  const [taskTypeTab, setTaskTypeTab] = React.useState<
    "recurring" | "one-shot"
  >("recurring");

  const recurringTasks = dashboard.dailyTasks.filter(
    (task) => task.taskTemplate.isRecurring,
  );
  const oneShotTasks = dashboard.dailyTasks.filter(
    (task) => !task.taskTemplate.isRecurring,
  );
  const filteredTasks =
    taskTypeTab === "recurring" ? recurringTasks : oneShotTasks;
  const completedCount = filteredTasks.filter((t) => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const tasksByWorkstation = buildTasksByWorkstation(filteredTasks);

  return (
    <>
      <TasksSummaryCards
        teamMembersCount={teamMembers.length}
        totalTasks={totalCount}
        progressPercent={progressPercent}
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

      <div className="mb-6">
        <div className="grid w-full grid-cols-2 rounded-xl border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setTaskTypeTab("recurring")}
            className={`min-h-11 rounded-lg px-3 py-3 text-sm font-medium transition ${
              taskTypeTab === "recurring"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {`Récurrentes (${recurringTasks.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTaskTypeTab("one-shot")}
            className={`min-h-11 rounded-lg px-3 py-3 text-sm font-medium transition ${
              taskTypeTab === "one-shot"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {`One-shot (${oneShotTasks.length})`}
          </button>
        </div>
      </div>

      <TasksByWorkstationList
        tasksByWorkstation={tasksByWorkstation}
        teamMembers={teamMembers}
        onToggleTask={onToggleTask}
        onReassignTask={onReassignTask}
        emptyMessage={
          taskTypeTab === "recurring"
            ? "Aucune tâche récurrente pour ces filtres."
            : "Aucune tâche one-shot pour ces filtres."
        }
        pendingTaskId={pendingTaskId}
        isTaskUpdating={isTaskUpdating}
      />
    </>
  );
}
