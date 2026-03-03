import React, { useState, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useManagerDashboardQuery } from "@/hooks/queries";
import { todayLocalISO } from "@/lib/date-utils";
import { ManagerDashboardHeader } from "./ManagerDashboard/ManagerDashboardHeader";
import { SettingsModal } from "./ManagerDashboard/SettingsModal";
import { ManagerExceptionAlertsBar } from "./ManagerDashboard/ManagerExceptionAlertsBar";

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
    <>
      <ManagerDashboardHeader
        teamName={teamName}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLogout={handleLogout}
      />
      <ManagerExceptionAlertsBar teamId={teamId} />
      <Outlet />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        teamName={teamName}
        modalRef={settingsModalRef}
        user={user}
        teamId={teamId}
      />
    </>
  );
}
