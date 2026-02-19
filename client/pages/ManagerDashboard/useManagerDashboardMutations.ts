import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import {
  useCreateWorkstationMutation,
  useDeleteWorkstationMutation,
  useCreateEmployeeMutation,
  useUpdateEmployeeWorkstationsMutation,
  useCreateTaskTemplateMutation,
  queryKeys,
} from "@/hooks/queries";

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
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);

  const createWorkstation = useCreateWorkstationMutation({
    onSuccess: () => {
      setNewWorkstation("");
      setOperationSuccess("Workstation created successfully!");
      setOperationError(null);
    },
    onError: (err) => {
      setOperationError(err.message);
      setOperationSuccess(null);
    },
  });
  const deleteWorkstation = useDeleteWorkstationMutation({
    onSuccess: () => {
      setOperationSuccess("Workstation deleted successfully!");
      setOperationError(null);
    },
    onError: (err) => {
      setOperationError(err.message);
      setOperationSuccess(null);
    },
  });
  const createEmployee = useCreateEmployeeMutation({
    onSuccess: (data) => {
      setNewEmployee(initialNewEmployee);
      setOperationSuccess(
        `Employee created successfully!${data.emailSent ? " Email sent." : " (Email delivery skipped)"}`,
      );
      setOperationError(null);
    },
    onError: (err) => {
      setOperationError(err.message);
      setOperationSuccess(null);
    },
  });
  const updateEmployeeWorkstations = useUpdateEmployeeWorkstationsMutation({
    onSuccess: () => {
      setEditingEmployee(null);
      setEditingWorkstations([]);
      setOperationSuccess("Employee workstations updated successfully!");
      setOperationError(null);
    },
    onError: (err) => {
      setOperationError(err.message);
      setOperationSuccess(null);
    },
  });
  const createTaskTemplate = useCreateTaskTemplateMutation({
    onSuccess: () => {
      setNewTask(initialNewTask);
      setOperationSuccess(null);
      onTaskTemplateCreated?.();
    },
    onError: (err) => {
      setOperationError(err.message ?? "Failed to create task");
    },
  });

  useSocketTaskEvents(queryClient, on, setOperationSuccess);

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
    operationError,
    setOperationError,
    operationSuccess,
    setOperationSuccess,
    createWorkstation,
    deleteWorkstation,
    createEmployee,
    updateEmployeeWorkstations,
    createTaskTemplate,
  };
}

function useSocketTaskEvents(
  queryClient: ReturnType<typeof useQueryClient>,
  on: (event: string, handler: (...args: unknown[]) => void) => () => void,
  setOperationSuccess: (msg: string | null) => void,
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
        setOperationSuccess(
          `Task "${data.taskTitle ?? ""}" assigned to ${data.employeeName ?? ""}`,
        );
        setTimeout(() => setOperationSuccess(null), 5000);
      },
    );

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, queryClient, setOperationSuccess]);
}
