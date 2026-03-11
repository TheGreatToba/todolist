import React from "react";
import { TasksSummaryCards } from "./TasksSummaryCards";
import { DashboardTodaySection } from "./DashboardTodaySection";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import { useNavigate } from "react-router-dom";

interface OverviewTabProps {
  dashboard: ManagerDashboardType;
  onToggleTask: (taskId: string, isCompleted: boolean) => void;
  pendingTaskId?: string | null;
  isTaskUpdating?: boolean;
}

export function OverviewTab(props: OverviewTabProps) {
  const navigate = useNavigate();

  const filteredTasks = props.dashboard.dailyTasks;
  const completedCount = filteredTasks.filter((t) => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const recurringCount = filteredTasks.filter(
    (t) => t.taskTemplate.isRecurring,
  ).length;
  const oneShotCount = totalCount - recurringCount;
  const recurringToAssign =
    props.dashboard.dayPreparation?.recurringUnassignedCount ?? 0;
  const dayPrepared =
    props.dashboard.dayPreparation?.isPrepared ?? recurringToAssign === 0;
  const now = new Date();
  const showLateOpeningWarning = !dayPrepared && now.getHours() >= 14;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-10 animate-fade-in-up">
      <TasksSummaryCards
        totalTasks={totalCount}
        progressPercent={progressPercent}
        oneShotCount={oneShotCount}
        recurringCount={recurringCount}
        recurringToAssign={recurringToAssign}
        dayPrepared={dayPrepared}
        showLateOpeningWarning={showLateOpeningWarning}
        onPrepareMyDay={() => navigate("/manager/tasks")}
      />

      <DashboardTodaySection
        onToggleTask={props.onToggleTask}
        pendingTaskId={props.pendingTaskId ?? null}
        isTaskUpdating={props.isTaskUpdating ?? false}
      />
    </div>
  );
}
