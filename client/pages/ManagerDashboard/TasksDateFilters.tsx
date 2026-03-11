import React from "react";
import {
  CheckSquare,
  Download,
  Filter,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import type { TeamMember } from "./types";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface TasksDateFiltersProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedEmployee: string | null;
  onEmployeeChange: (id: string | null) => void;
  selectedWorkstation: string | null;
  onWorkstationChange: (id: string | null) => void;
  teamMembers: TeamMember[];
  workstations: ManagerDashboardType["workstations"];
  onExportCsv: () => void;
  onNewTask: () => void;
  isMultiSelectMode: boolean;
  onToggleMultiSelect: () => void;
}

export function TasksDateFilters({
  selectedDate,
  onDateChange,
  selectedEmployee,
  onEmployeeChange,
  selectedWorkstation,
  onWorkstationChange,
  teamMembers,
  workstations,
  onExportCsv,
  onNewTask,
  isMultiSelectMode,
  onToggleMultiSelect,
}: TasksDateFiltersProps) {
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    onDateChange(toISODate(d));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    onDateChange(toISODate(d));
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-2 rounded-lg border border-input bg-background hover:bg-secondary text-foreground transition-colors"
            aria-label="Jour précédent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-medium"
          />
          <button
            onClick={handleNextDay}
            className="p-2 rounded-lg border border-input bg-background hover:bg-secondary text-foreground transition-colors"
            aria-label="Jour suivant"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={onToggleMultiSelect}
            className={`inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg font-medium transition w-full sm:w-auto ${
              isMultiSelectMode
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-input text-foreground hover:bg-secondary"
            }`}
            type="button"
            aria-pressed={isMultiSelectMode}
          >
            <CheckSquare className="w-4 h-4" />
            Sélection multiple
          </button>
          <button
            onClick={onExportCsv}
            className="inline-flex justify-center items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition w-full sm:w-auto"
            type="button"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <button
            onClick={onNewTask}
            className="inline-flex justify-center items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition w-full sm:w-auto"
            type="button"
          >
            <Plus className="w-4 h-4" />
            Nouvelle tâche
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
        <div className="hidden sm:flex items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
        </div>
        <select
          value={selectedEmployee ?? ""}
          onChange={(e) => onEmployeeChange(e.target.value || null)}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Tous les employés</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={selectedWorkstation ?? ""}
          onChange={(e) => onWorkstationChange(e.target.value || null)}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Tous les postes</option>
          <option value="__direct__">Affectations directes</option>
          {workstations.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
