import { useState, useEffect } from "react";
import { todayLocalISO } from "@/lib/date-utils";

const STORAGE_KEY = "manager-dashboard-filters";

function isValidISODate(s: string): boolean {
  const d = new Date(s + "T12:00:00");
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

interface PersistedFilters {
  date?: string;
  employeeId?: string | null;
  workstationId?: string | null;
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

/** Dashboard filters only; tab/view is driven by URL in ManagerDashboard (no activeTab state). */
export function useManagerDashboardFilters() {
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

  // Persist filters whenever they change
  useEffect(() => {
    savePersisted({
      date: selectedDate,
      employeeId: selectedEmployee,
      workstationId: selectedWorkstation,
    });
  }, [selectedDate, selectedEmployee, selectedWorkstation]);

  return {
    selectedDate,
    setSelectedDate,
    selectedEmployee,
    setSelectedEmployee,
    selectedWorkstation,
    setSelectedWorkstation,
  };
}
