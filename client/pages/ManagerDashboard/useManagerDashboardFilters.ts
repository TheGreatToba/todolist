import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { todayLocalISO } from "@/lib/date-utils";

export type ManagerTab = "tasks" | "workstations" | "employees" | "templates";

const TAB_PARAM = "tab";
const VALID_TABS: ManagerTab[] = [
  "tasks",
  "workstations",
  "employees",
  "templates",
];

function tabFromParam(value: string | null): ManagerTab {
  if (value && VALID_TABS.includes(value as ManagerTab)) {
    return value as ManagerTab;
  }
  return "tasks";
}

export function useManagerDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayLocalISO(),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTabState] = useState<ManagerTab>(() =>
    tabFromParam(tabParam),
  );

  useEffect(() => {
    setActiveTabState(tabFromParam(searchParams.get(TAB_PARAM)));
  }, [searchParams]);

  const setActiveTab = (tab: ManagerTab) => {
    setActiveTabState(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(TAB_PARAM, tab);
      return next;
    });
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
