import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useManagerDashboardQuery,
  useWorkstationsQuery,
  useTeamMembersQuery,
} from "@/hooks/queries";
import { Loader2, LogOut } from "lucide-react";
import { useManagerDashboardFilters } from "./useManagerDashboardFilters";
import { useManagerDashboardModals } from "./useManagerDashboardModals";
import { useManagerDashboardMutations } from "./useManagerDashboardMutations";
import { ManagerDashboardHeader } from "./ManagerDashboardHeader";
import { TasksTab } from "./TasksTab";
import { WorkstationsTab } from "./WorkstationsTab";
import { EmployeesTab } from "./EmployeesTab";
import { NewTaskModal } from "./NewTaskModal";
import { SettingsModal } from "./SettingsModal";

export default function ManagerDashboard() {
  const navigate = useNavigate();
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

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleCreateWorkstation = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.setOperationError(null);
    mutations.setOperationSuccess(null);
    if (!mutations.newWorkstation.trim()) {
      mutations.setOperationError("Please enter a workstation name");
      return;
    }
    mutations.createWorkstation.mutate({
      name: mutations.newWorkstation.trim(),
    });
  };

  const handleDeleteWorkstation = (workstationId: string) => {
    if (!confirm("Are you sure you want to delete this workstation?")) return;
    mutations.deleteWorkstation.mutate(workstationId);
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.setOperationError(null);
    mutations.setOperationSuccess(null);
    if (
      !mutations.newEmployee.name ||
      !mutations.newEmployee.email ||
      mutations.newEmployee.workstationIds.length === 0
    ) {
      mutations.setOperationError(
        "Please fill in name, email and select at least one workstation",
      );
      return;
    }
    mutations.createEmployee.mutate(mutations.newEmployee);
  };

  const handleUpdateEmployeeWorkstations = (employeeId: string) => {
    if (mutations.editingWorkstations.length === 0) {
      mutations.setOperationError("Please select at least one workstation");
      return;
    }
    mutations.updateEmployeeWorkstations.mutate({
      employeeId,
      workstationIds: mutations.editingWorkstations,
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mutations.newTask.title) {
      mutations.setOperationError("Please fill in the task title");
      return;
    }
    if (
      mutations.newTask.assignmentType === "workstation" &&
      !mutations.newTask.workstationId
    ) {
      mutations.setOperationError("Please select a workstation");
      return;
    }
    if (
      mutations.newTask.assignmentType === "employee" &&
      !mutations.newTask.assignedToEmployeeId
    ) {
      mutations.setOperationError("Please select an employee");
      return;
    }
    mutations.createTaskTemplate.mutate({
      title: mutations.newTask.title,
      description: mutations.newTask.description,
      workstationId: mutations.newTask.workstationId,
      assignedToEmployeeId: mutations.newTask.assignedToEmployeeId,
      assignmentType: mutations.newTask.assignmentType,
      notifyEmployee: mutations.newTask.notifyEmployee,
    });
  };

  const handleExportCsv = () => {
    if (!dashboard) return;
    if (dashboard.dailyTasks.length === 0) {
      mutations.setOperationSuccess("No tasks to export for this date.");
      return;
    }
    const headers = [
      "Date",
      "Employee",
      "Workstation",
      "Task",
      "Status",
      "Completed At",
    ];
    const rows = dashboard.dailyTasks.map((t) => [
      filters.selectedDate,
      t.employee.name,
      t.taskTemplate.workstation?.name ?? "Direct",
      t.taskTemplate.title,
      t.isCompleted ? "Completed" : "Pending",
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Team not found
          </h2>
          <p className="text-muted-foreground mb-6">
            Please contact your administrator
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
            type="button"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <ManagerDashboardHeader
        teamName={dashboard.team.name}
        activeTab={filters.activeTab}
        onTabChange={filters.setActiveTab}
        onOpenSettings={modals.openSettingsModal}
        onLogout={handleLogout}
      />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {filters.activeTab === "tasks" && (
          <TasksTab
            dashboard={dashboard}
            teamMembers={teamMembers}
            selectedDate={filters.selectedDate}
            setSelectedDate={filters.setSelectedDate}
            selectedEmployee={filters.selectedEmployee}
            setSelectedEmployee={filters.setSelectedEmployee}
            selectedWorkstation={filters.selectedWorkstation}
            setSelectedWorkstation={filters.setSelectedWorkstation}
            operationError={mutations.operationError}
            operationSuccess={mutations.operationSuccess}
            setOperationError={mutations.setOperationError}
            setOperationSuccess={mutations.setOperationSuccess}
            onExportCsv={handleExportCsv}
            onNewTask={() => modals.setShowNewTaskModal(true)}
          />
        )}

        {filters.activeTab === "workstations" && (
          <WorkstationsTab
            workstations={workstations}
            newWorkstation={mutations.newWorkstation}
            onNewWorkstationChange={mutations.setNewWorkstation}
            onSubmitCreate={handleCreateWorkstation}
            onDelete={handleDeleteWorkstation}
            operationError={mutations.operationError}
            operationSuccess={mutations.operationSuccess}
            setOperationError={mutations.setOperationError}
            setOperationSuccess={mutations.setOperationSuccess}
          />
        )}

        {filters.activeTab === "employees" && (
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
            operationError={mutations.operationError}
            operationSuccess={mutations.operationSuccess}
            setOperationError={mutations.setOperationError}
            setOperationSuccess={mutations.setOperationSuccess}
          />
        )}
      </div>

      <NewTaskModal
        isOpen={modals.showNewTaskModal}
        onClose={() => modals.setShowNewTaskModal(false)}
        form={mutations.newTask}
        onFormChange={mutations.setNewTask}
        onSubmit={handleCreateTask}
        workstations={dashboard.workstations}
        teamMembers={teamMembers}
        isSubmitting={mutations.createTaskTemplate.isPending}
      />

      <SettingsModal
        isOpen={modals.showSettingsModal}
        onClose={() => modals.setShowSettingsModal(false)}
        teamName={dashboard.team.name}
        modalRef={modals.settingsModalRef}
      />
    </div>
  );
}
