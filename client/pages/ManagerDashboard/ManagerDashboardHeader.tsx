import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Settings, Users } from "lucide-react";
import type { ManagerTab } from "./useManagerDashboardFilters";

export type NavTab = "today" | ManagerTab;

interface ManagerDashboardHeaderProps {
  teamName: string;
  subtitle?: string;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenSettings?: () => void;
  onLogout: () => void;
  showSettings?: boolean;
}

export function ManagerDashboardHeader({
  teamName,
  subtitle = "Manager Dashboard",
  activeTab,
  onTabChange,
  onOpenSettings,
  onLogout,
  showSettings = true,
}: ManagerDashboardHeaderProps) {
  const location = useLocation();
  const isOnManager = location.pathname === "/manager";

  return (
    <div className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{teamName}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {showSettings && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition"
                title="Settings"
                aria-label="Open team settings"
                type="button"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
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
          {isOnManager ? (
            <Link
              to="/today"
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === "today"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Today
            </Link>
          ) : (
            <span
              className={`px-4 py-2 font-medium border-b-2 border-primary text-primary`}
              aria-current="page"
            >
              Today
            </span>
          )}
          {isOnManager ? (
            <>
              <button
                onClick={() => onTabChange("tasks")}
                className={`px-4 py-2 font-medium transition border-b-2 ${
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
                Task
              </button>
            </>
          ) : (
            <>
              <Link
                to="/manager?tab=tasks"
                className="px-4 py-2 font-medium transition border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                to="/manager?tab=workstations"
                className="px-4 py-2 font-medium transition border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              >
                Workstations
              </Link>
              <Link
                to="/manager?tab=employees"
                className="px-4 py-2 font-medium transition border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              >
                <Users className="w-4 h-4 inline mr-2" />
                Employees
              </Link>
              <Link
                to="/manager?tab=templates"
                className="px-4 py-2 font-medium transition border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              >
                Task
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
