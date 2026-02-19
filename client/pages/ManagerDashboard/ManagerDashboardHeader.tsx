import React from "react";
import { LogOut, Settings, Users } from "lucide-react";
import type { ManagerTab } from "./useManagerDashboardFilters";

interface ManagerDashboardHeaderProps {
  teamName: string;
  activeTab: ManagerTab;
  onTabChange: (tab: ManagerTab) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export function ManagerDashboardHeader({
  teamName,
  activeTab,
  onTabChange,
  onOpenSettings,
  onLogout,
}: ManagerDashboardHeaderProps) {
  return (
    <div className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{teamName}</h1>
            <p className="text-sm text-muted-foreground">Manager Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition"
              title="Settings"
              aria-label="Open team settings"
              type="button"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
              title="Sign out"
              aria-label="Sign out"
              type="button"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-4 border-t border-border pt-4">
          <button
            onClick={() => onTabChange("tasks")}
            className={`px-4 py-2 font-medium transition border-b-2 ${
              activeTab === "tasks"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            type="button"
          >
            Tasks
          </button>
          <button
            onClick={() => onTabChange("workstations")}
            className={`px-4 py-2 font-medium transition border-b-2 ${
              activeTab === "workstations"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            type="button"
          >
            Workstations
          </button>
          <button
            onClick={() => onTabChange("employees")}
            className={`px-4 py-2 font-medium transition border-b-2 ${
              activeTab === "employees"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            type="button"
          >
            <Users className="w-4 h-4 inline mr-2" />
            Employees
          </button>
          <button
            onClick={() => onTabChange("templates")}
            className={`px-4 py-2 font-medium transition border-b-2 ${
              activeTab === "templates"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            type="button"
          >
            Templates
          </button>
        </div>
      </div>
    </div>
  );
}
