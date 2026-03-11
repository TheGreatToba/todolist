import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LogOut,
  Settings,
  Users,
  Gauge,
  LayoutDashboard,
  Monitor,
  ListTodo,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface ManagerSidebarProps {
  teamName: string;
  onOpenSettings: () => void;
  onLogout: () => void;
}

// Composant pour la navigation mobile (style iOS Health)
function MobileNavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center justify-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
          isActive
            ? "bg-primary text-primary-foreground shadow-md"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`w-6 h-6 flex-shrink-0 ${isActive ? "" : "opacity-80"}`}
          />
          {isActive && (
            <span className="font-semibold text-sm whitespace-nowrap animate-in fade-in zoom-in duration-300">
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function ManagerSidebar({
  teamName,
  onOpenSettings,
  onLogout,
}: ManagerSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const pcNavLinkClass =
    "flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-muted-foreground transition-all duration-300 hover:bg-secondary/80 hover:text-foreground hover:shadow-sm overflow-hidden whitespace-nowrap";
  const pcActiveLinkClass =
    "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-semibold shadow-[inset_4px_0_0_0_hsl(var(--primary))]";

  return (
    <>
      {/* --- VERSION MOBILE --- */}
      <aside className="md:hidden fixed bottom-4 left-4 right-4 rounded-3xl glass-panel flex shadow-2xl z-50 bg-background/80 backdrop-blur-xl border-none">
        <nav className="flex-1 flex items-center justify-between gap-1 p-2 overflow-x-auto no-scrollbar">
          <MobileNavItem
            to="/manager/dashboard"
            icon={LayoutDashboard}
            label="Tableau de bord"
          />
          <MobileNavItem to="/manager/pilotage" icon={Gauge} label="Pilotage" />
          <MobileNavItem to="/manager/tasks" icon={ListTodo} label="Tâches" />
          <MobileNavItem
            to="/manager/templates"
            icon={FileText}
            label="Modèles"
          />
          <MobileNavItem
            to="/manager/employees"
            icon={Users}
            label="Employés"
          />
          <MobileNavItem
            to="/manager/workstations"
            icon={Monitor}
            label="Postes"
          />

          <div className="flex items-center gap-1 pl-1 ml-1 border-l border-border/30">
            <button
              onClick={onOpenSettings}
              aria-label="Open mobile settings"
              className="p-3 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-2xl transition-colors flex-shrink-0"
            >
              <Settings className="w-6 h-6" />
            </button>
            <button
              onClick={onLogout}
              className="p-3 text-destructive hover:bg-destructive/10 rounded-2xl transition-colors flex-shrink-0"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </nav>
      </aside>

      {/* --- VERSION PC --- */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 m-4 h-[calc(100vh-2rem)] rounded-3xl glass-panel bg-background/80 backdrop-blur-xl shadow-2xl z-30 transition-all duration-300 relative ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-8 bg-background border border-border rounded-full p-1.5 shadow-sm text-muted-foreground hover:text-foreground z-30 transition-transform"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        <div
          className={`p-6 flex flex-col justify-center min-h-[104px] overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? "items-center px-2" : ""}`}
        >
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 mb-1">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-8 w-8 rounded-lg object-contain flex-shrink-0"
                />
                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-primary via-primary to-accent drop-shadow-sm truncate pb-1">
                  {teamName}
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase font-bold opacity-80">
                Espace Manager
              </p>
            </>
          ) : (
            <img
              src="/logo.png"
              alt="Logo"
              className="h-8 w-8 rounded-lg object-contain"
            />
          )}
        </div>

        <nav
          className={`flex-1 py-6 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden ${isCollapsed ? "px-2" : "px-4"}`}
        >
          {!isCollapsed && (
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2 mb-2 px-4">
              Analyse
            </div>
          )}
          <NavLink
            to="/manager/dashboard"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Tableau de bord" : undefined}
          >
            <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Tableau de bord</span>}
          </NavLink>
          <NavLink
            to="/manager/pilotage"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Pilotage" : undefined}
          >
            <Gauge className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Pilotage</span>}
          </NavLink>

          {!isCollapsed ? (
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-4">
              Opérations
            </div>
          ) : (
            <div className="my-2 border-t border-border/50 mx-2"></div>
          )}

          <NavLink
            to="/manager/tasks"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Tâches" : undefined}
          >
            <ListTodo className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Tâches</span>}
          </NavLink>
          <NavLink
            to="/manager/templates"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Modèles de tâches" : undefined}
          >
            <FileText className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Modèles de tâches</span>}
          </NavLink>

          {!isCollapsed ? (
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2 px-4">
              Équipe & Matériel
            </div>
          ) : (
            <div className="my-2 border-t border-border/50 mx-2"></div>
          )}

          <NavLink
            to="/manager/employees"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Employés" : undefined}
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Employés</span>}
          </NavLink>
          <NavLink
            to="/manager/workstations"
            end
            className={({ isActive }) =>
              `${pcNavLinkClass} ${isActive ? pcActiveLinkClass : ""} ${isCollapsed ? "justify-center px-0" : ""}`
            }
            title={isCollapsed ? "Postes" : undefined}
          >
            <Monitor className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Postes</span>}
          </NavLink>
        </nav>

        <div
          className={`p-4 bg-card/30 flex flex-col gap-1 overflow-hidden rounded-b-3xl ${isCollapsed ? "px-2 items-center" : ""}`}
        >
          <button
            onClick={onOpenSettings}
            aria-label="Open team settings"
            title={isCollapsed ? "Paramètres" : undefined}
            className={`flex items-center gap-3 py-3 text-sm font-medium text-foreground hover:bg-secondary/80 rounded-lg transition-colors whitespace-nowrap ${isCollapsed ? "px-0 justify-center w-full" : "px-4"}`}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>Paramètres</span>}
          </button>
          <button
            onClick={onLogout}
            title={isCollapsed ? "Déconnexion" : undefined}
            className={`flex items-center gap-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors whitespace-nowrap ${isCollapsed ? "px-0 justify-center w-full" : "px-4"}`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
