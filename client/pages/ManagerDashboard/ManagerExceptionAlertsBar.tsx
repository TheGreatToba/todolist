import React, { useMemo } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useManagerTodayBoardQuery,
  useManagerDashboardQuery,
} from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { loadExceptionAlertsSettings } from "@/lib/exception-alerts";

interface ManagerExceptionAlertsBarProps {
  teamId: string | null;
}

export function ManagerExceptionAlertsBar({
  teamId,
}: ManagerExceptionAlertsBarProps) {
  const navigate = useNavigate();
  const { data: todayBoard } = useManagerTodayBoardQuery();
  const { data: dashboard } = useManagerDashboardQuery({
    date: todayLocalISO(),
  });

  const settings = loadExceptionAlertsSettings(teamId);

  const overdueCount = todayBoard?.overdue.length ?? 0;
  const unassignedCount = useMemo(() => {
    if (!dashboard?.dailyTasks) return 0;
    return dashboard.dailyTasks.filter(
      (t) => !(t as { employeeId?: string | null }).employeeId,
    ).length;
  }, [dashboard?.dailyTasks]);

  const criticalNotStartedCount = useMemo(() => {
    if (!todayBoard?.today) return 0;
    // Heuristic: treat tasks with a higher priorityScore as "critical".
    // This keeps the model transparent and avoids extra server logic.
    const CRITICAL_PRIORITY_THRESHOLD = 80;
    return todayBoard.today.filter(
      (t) =>
        !t.isCompleted && (t.priorityScore ?? 0) >= CRITICAL_PRIORITY_THRESHOLD,
    ).length;
  }, [todayBoard?.today]);

  const items: Array<{
    id: "overdue" | "critical" | "unassigned";
    label: string;
    count: number;
    enabled: boolean;
    threshold: number;
  }> = [
    {
      id: "overdue",
      label: "En retard",
      count: overdueCount,
      enabled: settings.enabled.overdue,
      threshold: settings.overdueCountThreshold,
    },
    {
      id: "critical",
      label: "Critiques non démarrées",
      count: criticalNotStartedCount,
      enabled: settings.enabled.criticalNotStarted,
      threshold: settings.criticalNotStartedCountThreshold,
    },
    {
      id: "unassigned",
      label: "Non assignées aujourd'hui",
      count: unassignedCount,
      enabled: settings.enabled.unassigned,
      threshold: settings.unassignedCountThreshold,
    },
  ];

  const activeItems = items.filter(
    (item) => item.enabled && item.count >= item.threshold,
  );

  if (activeItems.length === 0) return null;

  const handleClick = () => {
    navigate("/manager/pilotage");
  };

  return (
    <div className="bg-amber-50/80 border-b border-amber-200">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex items-center gap-1.5 text-amber-800 font-medium">
          <BellRing className="w-4 h-4" />
          <span>Alertes d&apos;exception</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {activeItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 border border-amber-200 text-amber-900"
            >
              <AlertTriangle className="w-3 h-3" />
              <span className="font-medium">
                {item.count} {item.label.toLowerCase()}
              </span>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100/80 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
        >
          Ouvrir le pilotage
        </button>
      </div>
    </div>
  );
}
