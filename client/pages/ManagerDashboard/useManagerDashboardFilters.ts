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

function tabFromSearchParams(searchParams: URLSearchParams): ManagerTab {
  const tab = searchParams.get(TAB_PARAM);
  return (VALID_TABS.includes(tab as ManagerTab) ? tab : "tasks") as ManagerTab;
}

export function useManagerDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayLocalISO(),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTabState] = useState<ManagerTab>(() =>
    tabFromSearchParams(searchParams),
  );

  useEffect(() => {
    setActiveTabState(tabFromSearchParams(searchParams));
  }, [searchParams]);

  const setActiveTab = (tab: ManagerTab) => {
    setActiveTabState(tab);
    setSearchParams(tab === "tasks" ? {} : { [TAB_PARAM]: tab });
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
