import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import {
  useCreateWorkstationMutation,
  useDeleteWorkstationMutation,
  useCreateEmployeeMutation,
  useUpdateEmployeeWorkstationsMutation,
  useCreateTaskTemplateMutation,
  useUpdateTaskTemplateMutation,
  useDeleteTaskTemplateMutation,
  queryKeys,
} from "@/hooks/queries";
import { toastSuccess, toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";

const FALLBACK = {
  createWorkstation: "Failed to create workstation.",
  deleteWorkstation: "Failed to delete workstation.",
  createEmployee: "Failed to create employee.",
  updateWorkstations: "Failed to update employee workstations.",
  createTask: "Failed to create task.",
  updateTemplate: "Failed to update template.",
  deleteTemplate: "Failed to delete template.",
} as const;

export const initialNewTask = {
  title: "",
  description: "",
  workstationId: "",
  assignedToEmployeeId: "",
  assignmentType: "workstation" as "workstation" | "employee",
  notifyEmployee: true,
};

export const initialNewEmployee = {
  name: "",
  email: "",
  workstationIds: [] as string[],
};

export interface UseManagerDashboardMutationsOptions {
  onTaskTemplateCreated?: () => void;
}

export function useManagerDashboardMutations(
  options: UseManagerDashboardMutationsOptions = {},
) {
  const queryClient = useQueryClient();
  const { on } = useSocket();
  const { onTaskTemplateCreated } = options;

  const [newTask, setNewTask] = useState(initialNewTask);
  const [newWorkstation, setNewWorkstation] = useState("");
  const [newEmployee, setNewEmployee] = useState(initialNewEmployee);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [editingWorkstations, setEditingWorkstations] = useState<string[]>([]);

  const createWorkstation = useCreateWorkstationMutation({
    onSuccess: () => {
      setNewWorkstation("");
      toastSuccess("Workstation created successfully!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.createWorkstation));
    },
  });
  const deleteWorkstation = useDeleteWorkstationMutation({
    onSuccess: () => {
      toastSuccess("Workstation deleted successfully!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.deleteWorkstation));
    },
  });
  const createEmployee = useCreateEmployeeMutation({
    onSuccess: (data) => {
      setNewEmployee(initialNewEmployee);
      toastSuccess(
        `Employee created successfully!${data.emailSent ? " Email sent." : " (Email delivery skipped)"}`,
      );
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.createEmployee));
    },
  });
  const updateEmployeeWorkstations = useUpdateEmployeeWorkstationsMutation({
    onSuccess: () => {
      setEditingEmployee(null);
      setEditingWorkstations([]);
      toastSuccess("Employee workstations updated successfully!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.updateWorkstations));
    },
  });
  const createTaskTemplate = useCreateTaskTemplateMutation({
    onSuccess: () => {
      setNewTask(initialNewTask);
      onTaskTemplateCreated?.();
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.createTask));
    },
  });
  const updateTaskTemplate = useUpdateTaskTemplateMutation({
    onSuccess: () => {
      toastSuccess("Template updated successfully!");
      // Note: Modal closing is handled in ManagerDashboard component's onSuccess callback
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.updateTemplate));
      // Note: Modal stays open on error so user can retry
    },
  });
  const deleteTaskTemplate = useDeleteTaskTemplateMutation({
    onSuccess: () => {
      toastSuccess("Template deleted successfully!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.deleteTemplate));
    },
  });

  useSocketTaskEvents(queryClient, on);

  return {
    newTask,
    setNewTask,
    newWorkstation,
    setNewWorkstation,
    newEmployee,
    setNewEmployee,
    editingEmployee,
    setEditingEmployee,
    editingWorkstations,
    setEditingWorkstations,
    createWorkstation,
    deleteWorkstation,
    createEmployee,
    updateEmployeeWorkstations,
    createTaskTemplate,
    updateTaskTemplate,
    deleteTaskTemplate,
  };
}

function useSocketTaskEvents(
  queryClient: ReturnType<typeof useQueryClient>,
  on: (event: string, handler: (...args: unknown[]) => void) => () => void,
) {
  useEffect(() => {
    const unsubscribeUpdate = on("task:updated", () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
    });

    const unsubscribeAssigned = on(
      "task:assigned",
      (data: { taskTitle?: string; employeeName?: string }) => {
        const title = (data.taskTitle ?? "").trim();
        const name = (data.employeeName ?? "").trim();
        const message =
          title && name
            ? `Task "${title}" assigned to ${name}`
            : title
              ? `Task "${title}" assigned`
              : name
                ? `Task assigned to ${name}`
                : "Task assigned";
        toastSuccess(message);
      },
    );

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, queryClient]);
}
