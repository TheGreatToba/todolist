import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { todayLocalISO } from "@/lib/date-utils";

export type ManagerTab = "tasks" | "workstations" | "employees" | "templates";

const PATH_TO_TAB: Record<string, ManagerTab> = {
  "/manager/dashboard": "tasks",
  "/manager/workstations": "workstations",
  "/manager/employees": "employees",
  "/manager/task": "templates",
};

const TAB_TO_PATH: Record<ManagerTab, string> = {
  tasks: "/manager/dashboard",
  workstations: "/manager/workstations",
  employees: "/manager/employees",
  templates: "/manager/task",
};

function tabFromPathname(pathname: string): ManagerTab {
  return PATH_TO_TAB[pathname] ?? "tasks";
}

export function useManagerDashboardFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayLocalISO(),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(
    null,
  );

  const activeTab = tabFromPathname(location.pathname);
  const setActiveTab = (tab: ManagerTab) => {
    navigate(TAB_TO_PATH[tab]);
  };

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
