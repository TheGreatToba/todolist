import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { todayLocalISO } from "@/lib/date-utils";
import { trackManagerKpiEvent } from "@/lib/metrics";

export type ManagerTab =
  | "tasks"
  | "workstations"
  | "employees"
  | "templates"
  | "pilotage";

const STORAGE_KEY = "manager-dashboard-filters";

const PATH_TO_TAB: Record<string, ManagerTab> = {
  "/manager/dashboard": "tasks",
  "/manager/workstations": "workstations",
  "/manager/employees": "employees",
  "/manager/task": "templates",
  "/manager/pilotage": "pilotage",
};

const TAB_TO_PATH: Record<ManagerTab, string> = {
  tasks: "/manager/dashboard",
  workstations: "/manager/workstations",
  employees: "/manager/employees",
  templates: "/manager/task",
  pilotage: "/manager/pilotage",
};

const VALID_TABS: ManagerTab[] = [
  "tasks",
  "workstations",
  "employees",
  "templates",
  "pilotage",
];

function tabFromPathname(pathname: string): ManagerTab {
  return PATH_TO_TAB[pathname] ?? "tasks";
}

function isValidISODate(s: string): boolean {
  const d = new Date(s + "T12:00:00");
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

interface PersistedFilters {
  date?: string;
  employeeId?: string | null;
  workstationId?: string | null;
  tab?: ManagerTab;
}

function loadPersisted(): PersistedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedFilters;
  } catch {
    return {};
  }
}

function savePersisted(f: PersistedFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // ignore
  }
}

export function useManagerDashboardFilters() {
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const p = loadPersisted();
    const date = p.date;
    return date && isValidISODate(date) ? date : todayLocalISO();
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(
    () => loadPersisted().employeeId ?? null,
  );
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(
    () => loadPersisted().workstationId ?? null,
  );

  const activeTab = tabFromPathname(location.pathname);
  const lastTabRef = useRef<ManagerTab>(activeTab);

  // Restore last tab only when landing on the default dashboard route
  useEffect(() => {
    const { tab: savedTab } = loadPersisted();
    if (
      location.pathname === "/manager/dashboard" &&
      savedTab &&
      VALID_TABS.includes(savedTab) &&
      savedTab !== "tasks"
    ) {
      navigate(TAB_TO_PATH[savedTab], { replace: true });
    }
  }, []);

  // Persist filters whenever they change
  useEffect(() => {
    savePersisted({
      date: selectedDate,
      employeeId: selectedEmployee,
      workstationId: selectedWorkstation,
      tab: activeTab,
    });
  }, [selectedDate, selectedEmployee, selectedWorkstation, activeTab]);

  const setActiveTab = useCallback(
    (tab: ManagerTab) => {
      navigate(TAB_TO_PATH[tab]);
      if (lastTabRef.current !== tab) {
        trackManagerKpiEvent("manager.tab_changed", {
          from: lastTabRef.current,
          to: tab,
        });
        lastTabRef.current = tab;
      }
    },
    [navigate],
  );

  return {
    selectedDate,
    setSelectedDate,
    selectedEmployee,
    setSelectedEmployee,
    selectedWorkstation,
    setSelectedWorkstation,
    activeTab,
    setActiveTab,
  };
}
