import React from "react";
import { Link } from "react-router-dom";
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

        <div className="border-t border-border pt-4 -mx-4 sm:mx-0">
          <div className="nav-tabs-scroll flex gap-2 sm:gap-4 overflow-x-auto pb-px px-4 sm:px-0">
            <Link
              to="/today"
              className="flex-shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 sm:px-4 py-2 font-medium text-muted-foreground transition hover:text-foreground"
            >
              Today
            </Link>
            <button
              onClick={() => onTabChange("tasks")}
              className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 font-medium transition border-b-2 ${
                activeTab === "tasks"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              type="button"
            >
              Dashboard
            </button>
            <button
              onClick={() => onTabChange("workstations")}
              className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 font-medium transition border-b-2 ${
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
              className={`flex-shrink-0 whitespace-nowrap inline-flex items-center px-3 sm:px-4 py-2 font-medium transition border-b-2 ${
                activeTab === "employees"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              type="button"
            >
              <Users className="w-4 h-4 inline mr-1.5 sm:mr-2 flex-shrink-0" />
              Employees
            </button>
            <button
              onClick={() => onTabChange("templates")}
              className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 font-medium transition border-b-2 ${
                activeTab === "templates"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              type="button"
            >
              Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
