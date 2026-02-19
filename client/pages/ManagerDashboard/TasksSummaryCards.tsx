import React from "react";

interface TasksSummaryCardsProps {
  teamMembersCount: number;
  totalTasks: number;
  progressPercent: number;
}

export function TasksSummaryCards({
  teamMembersCount,
  totalTasks,
  progressPercent,
}: TasksSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Team Members
        </p>
        <p className="text-3xl font-bold text-foreground mt-2">
          {teamMembersCount}
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Today&apos;s Tasks
        </p>
        <p className="text-3xl font-bold text-foreground mt-2">{totalTasks}</p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Completion Rate
        </p>
        <p className="text-3xl font-bold text-primary mt-2">
          {progressPercent}%
        </p>
      </div>
    </div>
  );
}
