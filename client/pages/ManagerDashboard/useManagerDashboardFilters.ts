import { useState } from "react";
import { todayLocalISO } from "@/lib/date-utils";

export type ManagerTab = "tasks" | "workstations" | "employees" | "templates";

export function useManagerDashboardFilters() {
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayLocalISO(),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<ManagerTab>("tasks");

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
