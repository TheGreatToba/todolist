import { fetchWithCsrf } from "@/lib/api";
import { logger } from "@/lib/logger";

export type ManagerKpiEventName =
  | "manager.prepare_day_started"
  | "manager.prepare_day_completed"
  | "manager.prepare_day_cancelled"
  | "manager.prepare_day_assignment"
  | "manager.batch_update_daily_tasks"
  | "manager.batch_update_templates"
  | "manager.tab_changed";

interface ManagerKpiEventPayload {
  name: ManagerKpiEventName;
  occurredAt?: string;
  properties?: Record<string, unknown>;
}

async function postManagerKpiEvent(payload: ManagerKpiEventPayload) {
  try {
    await fetchWithCsrf("/api/manager/kpi-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.debug("[kpi] failed to track event", payload.name, error);
  }
}

export function trackManagerKpiEvent(
  name: ManagerKpiEventName,
  properties?: Record<string, unknown>,
) {
  const occurredAt = new Date().toISOString();
  void postManagerKpiEvent({ name, occurredAt, properties });
}
