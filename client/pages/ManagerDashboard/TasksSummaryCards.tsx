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
          Membres de l&apos;équipe
        </p>
        <p className="text-3xl font-bold text-foreground mt-2">
          {teamMembersCount}
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Tâches du jour
        </p>
        <p className="text-3xl font-bold text-foreground mt-2">{totalTasks}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {oneShotCount} tâche(s) ponctuelle(s)
        </p>
        <p className="text-xs text-muted-foreground">
          {recurringCount} tâche(s) récurrente(s)
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Taux d&apos;achèvement
        </p>
        <p className="text-3xl font-bold text-primary mt-2">
          {progressPercent}%
        </p>
      </div>
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground font-medium">
          Statut de la journée
        </p>
        <p
          className={`text-lg font-semibold mt-2 ${
            dayPrepared ? "text-emerald-600" : "text-orange-600"
          }`}
        >
          {dayPrepared ? "Journée préparée" : "Journée non préparée"}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
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
