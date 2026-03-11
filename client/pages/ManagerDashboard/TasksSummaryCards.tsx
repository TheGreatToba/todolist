import React from "react";

interface TasksSummaryCardsProps {
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="glass-card rounded-xl border border-border/50 p-4 md:p-6 shadow-lg transition-transform hover:-translate-y-1">
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
          Tâches du jour
        </p>
        <p className="text-3xl md:text-4xl font-black text-foreground mt-2 md:mt-3 drop-shadow-sm">
          {totalTasks}
        </p>
        <div className="mt-3 md:mt-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground bg-secondary/50 rounded-md px-2 py-1 w-fit">
            <span className="text-primary">{oneShotCount}</span> ponctuelle(s)
          </p>
          <p className="text-xs font-semibold text-muted-foreground bg-secondary/50 rounded-md px-2 py-1 w-fit">
            <span className="text-primary">{recurringCount}</span> récurrente(s)
          </p>
        </div>
      </div>
      <div className="glass-card relative overflow-hidden rounded-xl border border-border/50 p-4 md:p-6 shadow-lg transition-transform hover:-translate-y-1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider relative z-10">
          Taux d&apos;achèvement
        </p>
        <p className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mt-2 md:mt-3 relative z-10 drop-shadow-sm">
          {progressPercent}%
        </p>
      </div>
      <div className="glass-card rounded-xl border border-border/50 p-4 md:p-6 shadow-lg transition-transform hover:-translate-y-1">
        <p className="text-sm text-muted-foreground font-medium">
          Statut de la journée
        </p>
        <p
          className={`text-lg font-semibold mt-1 md:mt-2 ${
            dayPrepared ? "text-emerald-600" : "text-orange-600"
          }`}
        >
          {dayPrepared ? "Journée préparée" : "Journée non préparée"}
        </p>
        <p className="text-sm text-muted-foreground mt-1 md:mt-2">
          {recurringToAssign} tâche(s) récurrente(s) non assignée(s)
        </p>
        {!dayPrepared && (
          <button
            type="button"
            onClick={onPrepareMyDay}
            className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            Préparer ma journée
          </button>
        )}
        {showLateOpeningWarning && (
          <p className="text-xs text-orange-700 mt-2">Ouverture non préparée</p>
        )}
      </div>
    </div>
  );
}
