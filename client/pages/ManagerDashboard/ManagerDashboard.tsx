import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerDashboardQuery,
  useWorkstationsQuery,
  useTeamMembersQuery,
  useTaskTemplatesQuery,
  useUpdateDailyTaskMutation,
  useUpdateWorkstationEmployeesMutation,
  useBatchUpdateDailyTasksMutation,
  useBatchUpdateTaskTemplatesMutation,
  useManagerWeeklyReportQuery,
} from "@/hooks/queries";
import { LogOut, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { formatBatchConflictSummary } from "@/lib/batch-conflict-messages";
import { getErrorMessage } from "@/lib/get-error-message";
import { todayLocalISO } from "@/lib/date-utils";
import { useManagerDashboardFilters } from "./useManagerDashboardFilters";
import { useManagerDashboardModals } from "./useManagerDashboardModals";
import { useManagerDashboardMutations } from "./useManagerDashboardMutations";
import { TasksTab } from "./TasksTab";
import { PilotageTab } from "./PilotageTab";
import { OverviewTab } from "./OverviewTab";
import { WorkstationsTab } from "./WorkstationsTab";
import { EmployeesTab } from "./EmployeesTab";
import { TemplatesTab } from "./TemplatesTab";
import { NewTaskModal } from "./NewTaskModal";
import { EditTaskTemplateModal } from "./EditTaskTemplateModal";
import type { EditTaskTemplateFormState } from "./EditTaskTemplateModal";
import { DIRECT_ASSIGNMENTS_ID } from "./types";
import { ManagerGlobalSearch } from "./ManagerGlobalSearch";
import type { ManagerBatchTaskTemplatesAction } from "@shared/api";
import { trackManagerKpiEvent } from "@/lib/metrics";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDeleteType = "workstation" | "employee" | "template";

function haptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

function hapticError() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([30, 50, 30]);
  }
}

/** View is derived from URL only; no tab state is kept in component or filters. */
function getManagerViewFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/manager\/([^/]+)/);
  if (!match) return null;
  const segment = match[1];
  if (
    [
      "dashboard",
      "pilotage",
      "tasks",
      "workstations",
      "employees",
      "templates",
    ].includes(segment)
  )
    return segment;
  return null;
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const view = getManagerViewFromPath(location.pathname);
  const { logout } = useAuth();

  const filters = useManagerDashboardFilters();
  const modals = useManagerDashboardModals();
  const mutations = useManagerDashboardMutations({
    onTaskTemplateCreated: () => modals.setShowNewTaskModal(false),
  });

  const { data: dashboard, isLoading } = useManagerDashboardQuery({
    date: filters.selectedDate,
    employeeId: filters.selectedEmployee,
    workstationId: filters.selectedWorkstation,
  });
  const { data: workstations = [] } = useWorkstationsQuery();
  const { data: teamMembers = [] } = useTeamMembersQuery();
  const { data: templates = [] } = useTaskTemplatesQuery();
  useManagerWeeklyReportQuery({
    date: filters.selectedDate,
  });
  const updateDailyTask = useUpdateDailyTaskMutation();
  const updateWorkstationEmployees = useUpdateWorkstationEmployeesMutation();
  const batchUpdateDailyTasks = useBatchUpdateDailyTasksMutation();
  const batchUpdateTaskTemplates = useBatchUpdateTaskTemplatesMutation();
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [pilotageDate, setPilotageDate] = useState(() => todayLocalISO());
  const [confirmDelete, setConfirmDelete] = useState<{
    type: ConfirmDeleteType;
    id: string;
    label: string;
  } | null>(null);

  const [editTemplateForm, setEditTemplateForm] =
    useState<EditTaskTemplateFormState | null>(null);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleCreateWorkstation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mutations.newWorkstation.trim()) {
      toastError("Merci de saisir un nom de poste");
      return;
    }
    mutations.createWorkstation.mutate({
      name: mutations.newWorkstation.trim(),
    });
  };

  const handleDeleteWorkstation = (workstationId: string) => {
    const workstation = workstations.find((ws) => ws.id === workstationId);
    setConfirmDelete({
      type: "workstation",
      id: workstationId,
      label: workstation?.name ?? "ce poste",
    });
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !mutations.newEmployee.name ||
      !mutations.newEmployee.email ||
      mutations.newEmployee.workstationIds.length === 0
    ) {
      toastError(
        "Merci de renseigner le nom, l'e-mail et au moins un poste pour l'employé",
      );
      return;
    }
    mutations.createEmployee.mutate(mutations.newEmployee);
  };

  const handleUpdateEmployeeWorkstations = (employeeId: string) => {
    if (mutations.editingWorkstations.length === 0) {
      toastError("Merci de sélectionner au moins un poste");
      return;
    }
    mutations.updateEmployeeWorkstations.mutate({
      employeeId,
      workstationIds: mutations.editingWorkstations,
    });
  };

  const handleDeleteEmployee = (employeeId: string) => {
    const employee = teamMembers.find((member) => member.id === employeeId);
    setConfirmDelete({
      type: "employee",
      id: employeeId,
      label: employee?.name ?? "cet employe",
    });
  };

  const handleResendWelcomeEmail = (employeeId: string) => {
    mutations.resendWelcomeEmail.mutate(employeeId);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      mutations.newTask.creationMode === "create" &&
      !mutations.newTask.title
    ) {
      toastError("Merci de renseigner le titre de la tâche");
      return;
    }
    if (
      mutations.newTask.creationMode === "template" &&
      !mutations.newTask.templateId
    ) {
      toastError("Merci de sélectionner un modèle de tâche");
      return;
    }
    if (
      (mutations.newTask.creationMode === "template" ||
        !mutations.newTask.isRecurring) &&
      mutations.newTask.assignmentType === "none"
    ) {
      toastError("Merci de choisir où assigner cette tâche");
      return;
    }
    if (
      (mutations.newTask.creationMode === "template" ||
        !mutations.newTask.isRecurring) &&
      mutations.newTask.assignmentType === "workstation" &&
      !mutations.newTask.workstationId
    ) {
      toastError("Merci de sélectionner un poste");
      return;
    }
    if (
      (mutations.newTask.creationMode === "template" ||
        !mutations.newTask.isRecurring) &&
      mutations.newTask.assignmentType === "employee" &&
      !mutations.newTask.assignedToEmployeeId
    ) {
      toastError("Merci de sélectionner un employé");
      return;
    }
    if (mutations.newTask.creationMode === "template") {
      const assignmentType = mutations.newTask.assignmentType;
      if (assignmentType === "none") {
        toastError("Merci de choisir où assigner cette tâche");
        return;
      }
      mutations.assignTaskFromTemplate.mutate({
        templateId: mutations.newTask.templateId,
        assignmentType,
        workstationId:
          assignmentType === "workstation"
            ? mutations.newTask.workstationId
            : undefined,
        assignedToEmployeeId:
          assignmentType === "employee"
            ? mutations.newTask.assignedToEmployeeId
            : undefined,
        notifyEmployee: mutations.newTask.notifyEmployee,
        date: filters.selectedDate,
      });
      return;
    }

    mutations.createTaskTemplate.mutate({
      title: mutations.newTask.title,
      description: mutations.newTask.description,
      workstationId: mutations.newTask.workstationId,
      assignedToEmployeeId: mutations.newTask.assignedToEmployeeId,
      assignmentType: mutations.newTask.assignmentType,
      notifyEmployee: mutations.newTask.notifyEmployee,
      isRecurring: mutations.newTask.isRecurring,
      date: filters.selectedDate,
    });
  };

  const handleToggleManagerTask = async (
    taskId: string,
    isCompleted: boolean,
  ) => {
    try {
      await updateDailyTask.mutateAsync({ taskId, isCompleted: !isCompleted });
      haptic();
    } catch (error) {
      hapticError();
      toastError(
        getErrorMessage(
          error,
          "Échec de la mise à jour de la tâche. Merci de réessayer.",
        ),
      );
    }
  };

  const handleReassignTask = async (taskId: string, employeeId: string) => {
    try {
      await updateDailyTask.mutateAsync({ taskId, employeeId });
      haptic();
    } catch (error) {
      hapticError();
      const fallback =
        error instanceof Error && /CONFLICT/i.test(error.message)
          ? "Cet employé a déjà cette tâche aujourd'hui."
          : "Échec de la ré-attribution de la tâche.";
      toastError(getErrorMessage(error, fallback));
    }
  };

  const handlePrepareAssign = async (
    templateId: string,
    employeeId: string,
  ) => {
    try {
      await mutations.assignTaskFromTemplate.mutateAsync({
        templateId,
        assignmentType: "employee",
        assignedToEmployeeId: employeeId,
        notifyEmployee: false,
        date: filters.selectedDate,
      });
    } catch (error) {
      toastError(
        getErrorMessage(
          error,
          "Échec de la préparation de la tâche pour la journée.",
        ),
      );
    }
  };

  const handleBatchAssignTasks = async (
    taskIds: string[],
    employeeId: string,
  ) => {
    if (!employeeId || taskIds.length === 0) return;
    try {
      const data = await batchUpdateDailyTasks.mutateAsync({
        taskIds,
        employeeId,
      });
      trackManagerKpiEvent("manager.batch_update_daily_tasks", {
        mode: "assign_or_reassign",
        taskCount: data.updatedCount,
        requestedTaskCount: taskIds.length,
        employeeId,
        date: filters.selectedDate,
        source: "tasks_tab_or_pilotage",
      });
      if (data.updatedCount > 0) {
        toastSuccess(
          `${data.updatedCount} tâche(s) assignée(s).`,
          data.conflicts.length > 0
            ? formatBatchConflictSummary(data.conflicts)
            : undefined,
        );
      }
      if (data.conflicts.length > 0 && data.updatedCount === 0) {
        toastError(
          "Aucune tâche mise à jour.",
          formatBatchConflictSummary(data.conflicts),
        );
      }
    } catch (error) {
      const fallback = "Échec de la mise à jour des tâches sélectionnées.";
      toastError(getErrorMessage(error, fallback));
    }
  };

  const handleBatchUnassignTasks = async (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    try {
      const data = await batchUpdateDailyTasks.mutateAsync({
        taskIds,
        employeeId: null,
      });
      trackManagerKpiEvent("manager.batch_update_daily_tasks", {
        mode: "unassign",
        taskCount: data.updatedCount,
        requestedTaskCount: taskIds.length,
        date: filters.selectedDate,
        source: "tasks_tab_or_pilotage",
      });
      if (data.updatedCount > 0) {
        toastSuccess(
          `${data.updatedCount} tâche(s) désassignée(s).`,
          data.conflicts.length > 0
            ? formatBatchConflictSummary(data.conflicts)
            : undefined,
        );
      }
      if (data.conflicts.length > 0 && data.updatedCount === 0) {
        toastError(
          "Aucune tâche désassignée.",
          formatBatchConflictSummary(data.conflicts),
        );
      }
    } catch (error) {
      const fallback = "Échec de la désassignation des tâches sélectionnées.";
      toastError(getErrorMessage(error, fallback));
    }
  };

  const handleBatchUpdateTemplates = async (
    options: ManagerBatchTaskTemplatesAction,
  ) => {
    if (options.templateIds.length === 0) return;
    try {
      await batchUpdateTaskTemplates.mutateAsync(options);
    } catch (error) {
      const fallback = "Échec de la mise à jour des modèles sélectionnés.";
      toastError(getErrorMessage(error, fallback));
    }
  };

  const handleEditTemplate = (
    template: import("@shared/api").TaskTemplateWithRelations,
  ) => {
    setEditTemplateForm({
      title: template.title,
      description: template.description || "",
      workstationId: template.workstationId || "",
      assignedToEmployeeId: template.assignedToEmployeeId || "",
      assignmentType: template.workstationId
        ? "workstation"
        : template.assignedToEmployeeId
          ? "employee"
          : "none",
      isRecurring: template.isRecurring,
      notifyEmployee: template.notifyEmployee,
    });
    modals.setEditingTemplate(template);
    modals.setShowEditTemplateModal(true);
  };

  const handleUpdateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modals.editingTemplate || !editTemplateForm) return;
    if (!editTemplateForm.title) {
      toastError("Merci de renseigner le titre de la tâche");
      return;
    }
    if (
      !editTemplateForm.isRecurring &&
      editTemplateForm.assignmentType === "none"
    ) {
      toastError("Merci de choisir où assigner cette tâche");
      return;
    }
    if (
      !editTemplateForm.isRecurring &&
      editTemplateForm.assignmentType === "workstation" &&
      !editTemplateForm.workstationId
    ) {
      toastError("Merci de sélectionner un poste");
      return;
    }
    if (
      !editTemplateForm.isRecurring &&
      editTemplateForm.assignmentType === "employee" &&
      !editTemplateForm.assignedToEmployeeId
    ) {
      toastError("Merci de sélectionner un employé");
      return;
    }

    const updateData: import("@shared/api").UpdateTaskTemplateRequest = {
      title: editTemplateForm.title,
      description:
        editTemplateForm.description === ""
          ? null
          : editTemplateForm.description || undefined,
      workstationId:
        editTemplateForm.assignmentType === "workstation"
          ? editTemplateForm.workstationId || null
          : null,
      assignedToEmployeeId:
        editTemplateForm.assignmentType === "employee"
          ? editTemplateForm.assignedToEmployeeId || null
          : null,
      isRecurring: editTemplateForm.isRecurring,
      notifyEmployee: editTemplateForm.notifyEmployee,
    };

    mutations.updateTaskTemplate.mutate(
      {
        templateId: modals.editingTemplate.id,
        data: updateData,
      },
      {
        onSuccess: () => {
          modals.setShowEditTemplateModal(false);
          modals.setEditingTemplate(null);
          setEditTemplateForm(null);
        },
      },
    );
  };

  const handleDeleteTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    setConfirmDelete({
      type: "template",
      id: templateId,
      label: template?.title ?? "cette tache",
    });
  };

  const executeConfirmDelete = () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    if (type === "workstation") {
      mutations.deleteWorkstation.mutate(id);
    } else if (type === "employee") {
      mutations.deleteEmployee.mutate(id);
    } else {
      mutations.deleteTaskTemplate.mutate(id);
    }
    setConfirmDelete(null);
  };

  const handleSelectEmployeeFromSearch = (employeeId: string) => {
    navigate("/manager/tasks");
    filters.setSelectedEmployee(employeeId);
    filters.setSelectedWorkstation(null);
  };

  const handleSelectWorkstationFromSearch = (workstationId: string) => {
    navigate("/manager/tasks");
    filters.setSelectedWorkstation(workstationId);
    filters.setSelectedEmployee(null);
  };

  const handleSelectTemplateFromSearch = () => {
    navigate("/manager/templates");
  };

  const handleSelectTaskFromSearch = (taskId: string) => {
    const task = dashboard?.dailyTasks.find((t) => t.id === taskId);
    if (!task) return;
    navigate("/manager/tasks");
    const empId =
      (task as { employeeId?: string | null; employee?: { id: string } })
        .employeeId ?? task.employee?.id;
    if (empId) filters.setSelectedEmployee(empId);
    const workstationId =
      task.taskTemplate.workstation?.id ?? DIRECT_ASSIGNMENTS_ID;
    filters.setSelectedWorkstation(workstationId);
  };

  const handleGoToTasksWithFilters = (options: {
    employeeId?: string | null;
    workstationId?: string | null;
  }) => {
    navigate("/manager/tasks");
    filters.setSelectedDate(todayLocalISO());
    filters.setSelectedEmployee(
      options.employeeId !== undefined ? options.employeeId : null,
    );
    filters.setSelectedWorkstation(
      options.workstationId !== undefined ? options.workstationId : null,
    );
  };

  // Reset edit form when modal closes
  useEffect(() => {
    if (!modals.showEditTemplateModal) {
      setEditTemplateForm(null);
    }
  }, [modals.showEditTemplateModal]);

  const handleExportCsv = () => {
    if (!dashboard) return;
    if (dashboard.dailyTasks.length === 0) {
      toastInfo("Aucune tâche à exporter pour cette date.");
      return;
    }
    const headers = [
      "Date",
      "Employé",
      "Poste",
      "Tâche",
      "Statut",
      "Terminée à",
    ];
    const rows = dashboard.dailyTasks.map((t) => [
      filters.selectedDate,
      t.employee.name,
      t.taskTemplate.workstation?.name ?? "Direct",
      t.taskTemplate.title,
      t.isCompleted ? "Terminée" : "En attente",
      t.completedAt ? new Date(t.completedAt).toLocaleString() : "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${filters.selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/10 px-4 py-8 animate-pulse">
        <div className="max-w-6xl mx-auto space-y-8 mt-4">
          <div className="h-8 w-64 bg-card/60 rounded-md border border-border/50"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-card/50 backdrop-blur-md rounded-xl border border-border/40"
              ></div>
            ))}
          </div>
          <div className="h-96 w-full bg-card/50 backdrop-blur-md rounded-xl border border-border/40 mt-8"></div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md rounded-2xl border border-border/50 p-8 text-center shadow-xl animate-fade-in-up">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <LogOut className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-black text-foreground mb-2 tracking-tight">
            Équipe introuvable
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Nous n'avons pas pu charger les données de votre espace manager.
          </p>
          <button
            onClick={handleLogout}
            className="w-full inline-flex justify-center items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
            type="button"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {view === "dashboard" && "Tableau de bord"}
              {view === "pilotage" && "Pilotage"}
              {view === "tasks" && "Tâches"}
              {view === "workstations" && "Postes"}
              {view === "employees" && "Employés"}
              {view === "templates" && "Modèles de tâches"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsGlobalSearchOpen(true)}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
            aria-label="Rechercher"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {view === "dashboard" && (
          <OverviewTab
            dashboard={dashboard}
            onToggleTask={handleToggleManagerTask}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
          />
        )}

        {view === "pilotage" && (
          <>
            <div className="flex items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(pilotageDate);
                  d.setDate(d.getDate() - 1);
                  setPilotageDate(d.toISOString().slice(0, 10));
                }}
                className="p-2 rounded-lg border border-input bg-background hover:bg-secondary text-foreground transition-colors"
                aria-label="Jour précédent"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <input
                id="pilotage-date"
                type="date"
                value={pilotageDate}
                onChange={(e) => setPilotageDate(e.target.value)}
                className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              />
              <button
                type="button"
                onClick={() => {
                  const d = new Date(pilotageDate);
                  d.setDate(d.getDate() + 1);
                  setPilotageDate(d.toISOString().slice(0, 10));
                }}
                className="p-2 rounded-lg border border-input bg-background hover:bg-secondary text-foreground transition-colors"
                aria-label="Jour suivant"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              {pilotageDate !== todayLocalISO() && (
                <button
                  type="button"
                  onClick={() => setPilotageDate(todayLocalISO())}
                  className="text-sm text-primary hover:underline ml-1"
                >
                  Aujourd&apos;hui
                </button>
              )}
            </div>
            <PilotageTab
              selectedDate={pilotageDate}
              teamMembers={teamMembers}
              onToggleTask={handleToggleManagerTask}
              onBatchAssignTasks={handleBatchAssignTasks}
              onGoToTasksWithFilters={handleGoToTasksWithFilters}
              isBatchUpdatingTasks={batchUpdateDailyTasks.isPending}
              pendingTaskId={updateDailyTask.variables?.taskId ?? null}
              isTaskUpdating={updateDailyTask.isPending}
            />
          </>
        )}

        {view === "tasks" && (
          <TasksTab
            dashboard={dashboard}
            teamMembers={teamMembers}
            selectedDate={filters.selectedDate}
            setSelectedDate={filters.setSelectedDate}
            selectedEmployee={filters.selectedEmployee}
            setSelectedEmployee={filters.setSelectedEmployee}
            selectedWorkstation={filters.selectedWorkstation}
            setSelectedWorkstation={filters.setSelectedWorkstation}
            onExportCsv={handleExportCsv}
            onNewTask={() => modals.setShowNewTaskModal(true)}
            onToggleTask={handleToggleManagerTask}
            onReassignTask={handleReassignTask}
            onPrepareAssign={handlePrepareAssign}
            isPrepareAssigning={mutations.assignTaskFromTemplate.isPending}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onBatchAssignTasks={handleBatchAssignTasks}
            onBatchUnassignTasks={handleBatchUnassignTasks}
            isBatchUpdatingTasks={batchUpdateDailyTasks.isPending}
          />
        )}

        {view === "workstations" && (
          <WorkstationsTab
            workstations={workstations}
            teamMembers={teamMembers}
            newWorkstation={mutations.newWorkstation}
            onNewWorkstationChange={mutations.setNewWorkstation}
            onSubmitCreate={handleCreateWorkstation}
            onDelete={handleDeleteWorkstation}
            onSaveEmployees={(workstationId, employeeIds) =>
              updateWorkstationEmployees.mutate(
                {
                  workstationId,
                  employeeIds,
                },
                {
                  onSuccess: () =>
                    toastInfo("Employes du poste mis a jour avec succes."),
                  onError: (error) =>
                    toastError(
                      getErrorMessage(
                        error,
                        "Echec de la mise a jour des employes du poste.",
                      ),
                    ),
                },
              )
            }
            isSavingEmployees={updateWorkstationEmployees.isPending}
          />
        )}

        {view === "employees" && (
          <EmployeesTab
            teamMembers={teamMembers}
            workstations={workstations}
            newEmployee={mutations.newEmployee}
            onNewEmployeeChange={mutations.setNewEmployee}
            onSubmitCreate={handleCreateEmployee}
            editingEmployee={mutations.editingEmployee}
            editingWorkstations={mutations.editingWorkstations}
            setEditingEmployee={mutations.setEditingEmployee}
            setEditingWorkstations={mutations.setEditingWorkstations}
            onSaveWorkstations={handleUpdateEmployeeWorkstations}
            onDeleteEmployee={handleDeleteEmployee}
            onResendWelcomeEmail={handleResendWelcomeEmail}
          />
        )}

        {view === "templates" && (
          <TemplatesTab
            templates={templates}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            onCreateTemplate={() => modals.setShowNewTaskModal(true)}
            teamMembers={teamMembers}
            workstations={workstations}
            onBatchUpdateTemplates={handleBatchUpdateTemplates}
            isBatchUpdatingTemplates={batchUpdateTaskTemplates.isPending}
          />
        )}
      </div>

      {view === "dashboard" && (
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(50);
            }
            modals.setShowNewTaskModal(true);
          }}
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:bottom-8 md:right-8 md:h-12 md:w-12"
          aria-label="Créer une tâche"
        >
          <Plus className="h-7 w-7 md:h-6 md:w-6" strokeWidth={2.5} />
        </button>
      )}

      <ManagerGlobalSearch
        open={isGlobalSearchOpen}
        onOpenChange={setIsGlobalSearchOpen}
        employees={teamMembers}
        workstations={workstations}
        templates={templates}
        dashboard={dashboard}
        onSelectEmployee={handleSelectEmployeeFromSearch}
        onSelectWorkstation={handleSelectWorkstationFromSearch}
        onSelectTemplate={handleSelectTemplateFromSearch}
        onSelectTask={handleSelectTaskFromSearch}
      />

      <NewTaskModal
        isOpen={modals.showNewTaskModal}
        onClose={() => modals.setShowNewTaskModal(false)}
        form={mutations.newTask}
        onFormChange={mutations.setNewTask}
        onSubmit={handleCreateTask}
        workstations={dashboard.workstations}
        templates={templates}
        teamMembers={teamMembers}
        isSubmitting={
          mutations.createTaskTemplate.isPending ||
          mutations.assignTaskFromTemplate.isPending
        }
      />

      <EditTaskTemplateModal
        isOpen={modals.showEditTemplateModal}
        onClose={() => {
          modals.setShowEditTemplateModal(false);
          modals.setEditingTemplate(null);
          setEditTemplateForm(null);
        }}
        template={modals.editingTemplate}
        form={
          editTemplateForm || {
            title: "",
            description: "",
            workstationId: "",
            assignedToEmployeeId: "",
            assignmentType: "none",
            isRecurring: true,
            notifyEmployee: true,
          }
        }
        onFormChange={setEditTemplateForm}
        onSubmit={handleUpdateTemplate}
        workstations={dashboard.workstations}
        teamMembers={teamMembers}
        isSubmitting={mutations.updateTaskTemplate.isPending}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.type === "workstation" &&
                `Voulez-vous vraiment supprimer le poste « ${confirmDelete.label} » ?`}
              {confirmDelete?.type === "employee" &&
                `Voulez-vous vraiment supprimer « ${confirmDelete.label} » ? Cette action est irréversible.`}
              {confirmDelete?.type === "template" &&
                `Voulez-vous vraiment supprimer la tâche « ${confirmDelete.label} » ? Les tâches déjà générées seront conservées comme historique.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
