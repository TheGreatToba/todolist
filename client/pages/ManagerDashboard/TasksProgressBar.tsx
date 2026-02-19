import React from "react";

interface TasksProgressBarProps {
  completedCount: number;
  totalCount: number;
  progressPercent: number;
}

export function TasksProgressBar({
  completedCount,
  totalCount,
  progressPercent,
}: TasksProgressBarProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-foreground">Overall Progress</h2>
        <span className="text-sm text-muted-foreground">
          {completedCount} of {totalCount} tasks completed
        </span>
      </div>
      <div className="w-full bg-border rounded-full h-4 overflow-hidden">
        <div
          className="bg-gradient-to-r from-primary to-primary/80 h-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
