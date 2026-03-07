import React, { useState, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useManagerDashboardQuery } from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { ManagerSidebar } from "./ManagerDashboard/ManagerSidebar";
import { SettingsModal } from "./ManagerDashboard/SettingsModal";
import { ManagerExceptionAlertsBar } from "./ManagerDashboard/ManagerExceptionAlertsBar";
import {
  Calendar,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

export default function ManagerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { data: dashboard } = useManagerDashboardQuery({
    date: todayLocalISO(),
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const settingsModalRef = useRef<HTMLDivElement | null>(null);

  const teamName = dashboard?.team?.name ?? "Responsable";
  const teamId = dashboard?.team?.id ?? user?.teamId ?? null;

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const mobileTabs = [
    { to: "/manager/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { to: "/manager/today", label: "Aujourd'hui", Icon: Calendar },
    { to: "/manager/task", label: "Modeles", Icon: ClipboardList },
    { to: "/manager/pilotage", label: "Pilotage", Icon: Gauge },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30 relative">
      <div className="absolute inset-0 pointer-events-none mesh-gradient-bg opacity-30 z-0"></div>

      <ManagerSidebar
        teamName={teamName}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <header className="md:hidden sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{teamName}</p>
              <p className="text-xs text-muted-foreground">Espace manager</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Se deconnecter"
              title="Se deconnecter"
            >
              <LogOut className="h-4 w-4" />
              <span>Se deconnecter</span>
            </button>
          </div>
        </header>

        <ManagerExceptionAlertsBar teamId={teamId} />

        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-[1600px] mx-auto p-4 pb-24 md:p-8 md:pb-8 w-full animate-fade-in-up">
            <Outlet />
          </div>
        </div>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur">
        <ul className="grid grid-cols-4">
          {mobileTabs.map(({ to, label, Icon }) => {
            const isActive =
              location.pathname === to ||
              location.pathname.startsWith(`${to}/`);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        teamName={teamName}
        modalRef={settingsModalRef}
        user={user}
        teamId={teamId}
      />
    </div>
  );
}
