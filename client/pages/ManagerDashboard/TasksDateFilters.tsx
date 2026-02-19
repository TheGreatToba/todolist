import React from "react";
import { Filter, Calendar, Download, Plus } from "lucide-react";
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
}: TasksDateFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-sm text-muted-foreground self-center">
          History:
        </span>
        {[...Array(8)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          const label =
            i === 0 ? "Today" : i === 1 ? "Yesterday" : `-${i} days`;
          return (
            <button
              key={dateStr}
              onClick={() => onDateChange(dateStr)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
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

      <div className="flex flex-wrap items-center gap-2 mb-6 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Select date"
            />
          </div>
          <select
            value={selectedEmployee ?? ""}
            onChange={(e) => onEmployeeChange(e.target.value || null)}
            className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by employee"
          >
            <option value="">All Employees</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={selectedWorkstation ?? ""}
            onChange={(e) => onWorkstationChange(e.target.value || null)}
            className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Filter by workstation"
          >
            <option value="">All Workstations</option>
            <option value="__direct__">Direct assignments</option>
            {workstations.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition"
            type="button"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={onNewTask}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
            type="button"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>
    </>
  );
}
