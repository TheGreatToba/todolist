import React from "react";
import { NavLink } from "react-router-dom";
import {
  LogOut,
  Settings,
  Users,
  Gauge,
  Calendar,
  LayoutDashboard,
  Monitor,
  ListTodo,
} from "lucide-react";

interface ManagerSidebarProps {
  teamName: string;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const navLinkClass =
  "flex items-center gap-3 px-4 py-3 min-w-[200px] rounded-lg font-medium text-muted-foreground transition-all duration-300 hover:bg-secondary/80 hover:text-foreground hover:shadow-sm";

const activeLinkClass =
  "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-semibold shadow-[inset_4px_0_0_0_hsl(var(--primary))]";

export function ManagerSidebar({
  teamName,
  onOpenSettings,
  onLogout,
}: ManagerSidebarProps) {
  return (
    <aside className="hidden w-64 flex-shrink-0 min-h-screen glass-panel border-r md:flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20">
      <div className="p-6 border-b border-border/50">
        <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-primary via-primary to-accent drop-shadow-sm">
          {teamName}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase font-bold opacity-80">
          Espace Manager
        </p>
      </div>

      <nav className="flex-1 px-4 py-6 flex flex-col gap-1.5 overflow-y-auto">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2 mb-2 px-4">
          Analyse
        </div>
        <NavLink
          to="/manager/dashboard"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          Tableau de bord
        </NavLink>
        <NavLink
          to="/manager/pilotage"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <Gauge className="w-5 h-5" />
          Pilotage
        </NavLink>

        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-4">
          Opérations
        </div>
        <NavLink
          to="/manager/today"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <Calendar className="w-5 h-5" />
          Aujourd'hui
        </NavLink>
        <NavLink
          to="/manager/task"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <ListTodo className="w-5 h-5" />
          Tâches
        </NavLink>

        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-4">
          Équipe & Matériel
        </div>
        <NavLink
          to="/manager/employees"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <Users className="w-5 h-5" />
          Employés
        </NavLink>
        <NavLink
          to="/manager/workstations"
          end
          className={({ isActive }) =>
            `${navLinkClass} ${isActive ? activeLinkClass : ""}`
          }
        >
          <Monitor className="w-5 h-5" />
          Postes
        </NavLink>
      </nav>

      <div className="p-4 border-t border-border/50 bg-card/30 flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/80 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
