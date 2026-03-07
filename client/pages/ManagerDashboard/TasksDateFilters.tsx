import React from "react";
import { Calendar, CheckSquare, Download, Filter, Plus } from "lucide-react";
import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";
import type { TeamMember } from "./types";

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
  return (
    <>
      <div className="mb-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
        <span className="text-sm text-muted-foreground self-center shrink-0">
          Historique :
        </span>
        {[...Array(8)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          const label =
            i === 0 ? "Aujourd'hui" : i === 1 ? "Hier" : `-${i} jours`;
          return (
            <button
              key={dateStr}
              onClick={() => onDateChange(dateStr)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedDate === dateStr
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-foreground hover:bg-secondary"
              }`}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1 shrink-0">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Sélectionner une date"
            />
          </div>
          <select
            value={selectedEmployee ?? ""}
            onChange={(e) => onEmployeeChange(e.target.value || null)}
            className="shrink-0 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filtrer par employé"
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
            className="shrink-0 px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filtrer par poste"
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
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onToggleMultiSelect}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition sm:w-auto ${
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
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-[#FF85C2] hover:bg-[#E91E8C] text-white rounded-lg font-medium transition"
            type="button"
          >
            <Download className="w-4 h-4" />
            Exporter en CSV
          </button>
          <button
            onClick={onNewTask}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-[#E91E8C] hover:bg-[#cc1578] text-white rounded-lg font-medium transition"
            type="button"
          >
            <Plus className="w-4 h-4" />
            Nouvelle tâche
          </button>
        </div>
      </div>
    </>
  );
}
