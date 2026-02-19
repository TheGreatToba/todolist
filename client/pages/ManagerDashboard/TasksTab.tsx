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
}: TasksTabProps) {
  const filteredTasks = dashboard.dailyTasks;
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

      <TasksByWorkstationList tasksByWorkstation={tasksByWorkstation} />
    </>
  );
}
