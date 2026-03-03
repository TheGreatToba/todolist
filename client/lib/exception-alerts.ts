export type ExceptionAlertType =
  | "overdue"
  | "criticalNotStarted"
  | "unassigned";

export interface ExceptionAlertThresholds {
  /**
   * Minimum number of matching items before an alert is raised.
   * Example: if overdueCountThreshold = 3, the "overdue" alert only appears
   * when there are 3 or more overdue tasks.
   */
  overdueCountThreshold: number;
  criticalNotStartedCountThreshold: number;
  unassignedCountThreshold: number;
}

export interface ExceptionAlertsSettings extends ExceptionAlertThresholds {
  enabled: {
    overdue: boolean;
    criticalNotStarted: boolean;
    unassigned: boolean;
  };
}

const DEFAULT_SETTINGS: ExceptionAlertsSettings = {
  overdueCountThreshold: 1,
  criticalNotStartedCountThreshold: 1,
  unassignedCountThreshold: 1,
  enabled: {
    overdue: true,
    criticalNotStarted: true,
    unassigned: true,
  },
};

function storageKeyForTeam(teamId: string | null | undefined): string {
  const suffix = teamId ? teamId : "default";
  return `manager-exception-alerts:${suffix}`;
}

export function loadExceptionAlertsSettings(
  teamId: string | null | undefined,
): ExceptionAlertsSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(storageKeyForTeam(teamId));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ExceptionAlertsSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      enabled: {
        ...DEFAULT_SETTINGS.enabled,
        ...(parsed.enabled ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveExceptionAlertsSettings(
  teamId: string | null | undefined,
  settings: ExceptionAlertsSettings,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKeyForTeam(teamId),
      JSON.stringify(settings),
    );
  } catch {
    // ignore quota / serialization issues, alerts are a UX enhancement
  }
}
