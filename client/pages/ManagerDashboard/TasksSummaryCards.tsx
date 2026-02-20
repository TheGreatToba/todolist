import React from "react";

interface TasksSummaryCardsProps {
  teamMembersCount: number;
  totalTasks: number;
  progressPercent: number;
  oneShotCount: number;
  recurringCount: number;
  recurringToAssign: number;
  dayPrepared: boolean;
  showLateOpeningWarning: boolean;
  onPrepareMyDay: () => void;
}

export function TasksSummaryCards({
  teamMembersCount,
  totalTasks,
  progressPercent,
  oneShotCount,
  recurringCount,
  recurringToAssign,
  dayPrepared,
  showLateOpeningWarning,
  onPrepareMyDay,
}: TasksSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
        <p className="text-xs text-muted-foreground mt-2">
          {oneShotCount} one-shot
        </p>
        <p className="text-xs text-muted-foreground">
          {recurringCount} recurring
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Completion Rate
        </p>
        <p className="text-3xl font-bold text-primary mt-2">
          {progressPercent}%
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">Day status</p>
        <p
          className={`text-lg font-semibold mt-2 ${
            dayPrepared ? "text-emerald-600" : "text-orange-600"
          }`}
        >
          {dayPrepared ? "Day prepared" : "Day not prepared"}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {recurringToAssign} recurring not assigned
        </p>
        {!dayPrepared && (
          <button
            type="button"
            onClick={onPrepareMyDay}
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            Prepare my day
          </button>
        )}
        {showLateOpeningWarning && (
          <p className="text-xs text-orange-700 mt-2">Opening not prepared</p>
        )}
      </div>
    </div>
  );
}
