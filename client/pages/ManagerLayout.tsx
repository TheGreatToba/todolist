import React, { useState, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useManagerDashboardQuery } from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { ManagerSidebar } from "./ManagerDashboard/ManagerSidebar";
import { SettingsModal } from "./ManagerDashboard/SettingsModal";
import { ManagerExceptionAlertsBar } from "./ManagerDashboard/ManagerExceptionAlertsBar";
import {
  Calendar,
  LayoutDashboard,
  ListTodo,
  Monitor,
  Settings,
  Users,
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
  const mobileTabs = [
    { to: "/manager/today", label: "Aujourd'hui", icon: Calendar },
    { to: "/manager/pilotage", label: "Dashboard", icon: LayoutDashboard },
    { to: "/manager/dashboard", label: "Tâches", icon: ListTodo },
    { to: "/manager/employees", label: "Employés", icon: Users },
    { to: "/manager/workstations", label: "Postes", icon: Monitor },
  ] as const;

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
        <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white">
          <div className="h-full px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Tasty Crousty"
                className="h-7 w-auto object-contain"
              />
              <span className="text-sm font-semibold text-[#1A1A2E]">
                Tasty Crousty
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#E91E8C]">
              {user?.role ?? "MANAGER"}
            </span>
          </div>
        </header>

        <div className="h-14 md:hidden" />
        <ManagerExceptionAlertsBar teamId={teamId} />

        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-[1600px] mx-auto p-4 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-8 md:p-8 w-full animate-fade-in-up">
            <Outlet />
          </div>
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white h-[60px] pb-[env(safe-area-inset-bottom)]">
        <div className="h-full px-2 flex items-center justify-between gap-1">
          {mobileTabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            const Icon = tab.icon;
            return (
              <button
                key={tab.to}
                type="button"
                onClick={() => navigate(tab.to)}
                className={`flex min-w-0 flex-1 items-center justify-center rounded-full px-2 py-2 text-xs font-medium transition ${
                  isActive
                    ? "text-[#E91E8C] bg-[#FFE0F0]"
                    : "text-slate-400 hover:text-slate-500"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {isActive && <span className="ml-1 truncate">{tab.label}</span>}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Ouvrir les paramètres"
            onClick={() => setShowSettingsModal(true)}
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-[#FFE0F0] hover:text-[#E91E8C] transition"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
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
