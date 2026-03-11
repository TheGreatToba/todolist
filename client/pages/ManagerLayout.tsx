import React, { useState, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useManagerDashboardQuery } from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { ManagerSidebar } from "./ManagerDashboard/ManagerSidebar";
import { SettingsModal } from "./ManagerDashboard/SettingsModal";

export default function ManagerLayout() {
  const navigate = useNavigate();
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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30 relative">
      <div className="absolute inset-0 pointer-events-none mesh-gradient-bg opacity-30 z-0"></div>

      <ManagerSidebar
        teamName={teamName}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden pb-24 md:pb-0">
        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-[1600px] mx-auto w-full animate-fade-in-up">
            <Outlet />
          </div>
        </div>
      </main>
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
