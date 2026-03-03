import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import {
  useCreateWorkstationMutation,
  useDeleteWorkstationMutation,
  useCreateEmployeeMutation,
  useUpdateEmployeeWorkstationsMutation,
  useDeleteEmployeeMutation,
  useResendWelcomeEmailMutation,
  useCreateTaskTemplateMutation,
  useAssignTaskFromTemplateMutation,
  useUpdateTaskTemplateMutation,
  useDeleteTaskTemplateMutation,
  queryKeys,
} from "@/hooks/queries";
import { toastSuccess, toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";

const FALLBACK = {
  createWorkstation: "Echec de la creation du poste.",
  deleteWorkstation: "Echec de la suppression du poste.",
  createEmployee: "Echec de la creation de l'employe.",
  updateWorkstations: "Echec de la mise a jour des postes de l'employe.",
  deleteEmployee: "Echec de la suppression de l'employe.",
  resendWelcomeEmail: "Echec du renvoi de l'e-mail de bienvenue.",
  createTask: "Echec de la creation de la tache.",
  updateTemplate: "Echec de la mise a jour du modele.",
  deleteTemplate: "Echec de la suppression du modele.",
} as const;

export const initialNewTask = {
  creationMode: "create" as "create" | "template",
  templateId: "",
  title: "",
  description: "",
  workstationId: "",
  assignedToEmployeeId: "",
  assignmentType: "none" as "workstation" | "employee" | "none",
  notifyEmployee: true,
  isRecurring: true,
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
      toastSuccess("Poste cree avec succes!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.createWorkstation));
    },
  });
  const deleteWorkstation = useDeleteWorkstationMutation({
    onSuccess: () => {
      toastSuccess("Poste supprime avec succes!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.deleteWorkstation));
    },
  });
  const createEmployee = useCreateEmployeeMutation({
    onSuccess: (data) => {
      setNewEmployee(initialNewEmployee);
      const emailMsg = data.emailSent
        ? " Email envoyé."
        : data.emailError
          ? ` E-mail non envoyé : ${data.emailError}`
          : " E-mail non envoyé (vérifiez la config SMTP).";
      toastSuccess(`Employé créé avec succès.${emailMsg}`);
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.createEmployee));
    },
  });
  const updateEmployeeWorkstations = useUpdateEmployeeWorkstationsMutation({
    onSuccess: () => {
      setEditingEmployee(null);
      setEditingWorkstations([]);
      toastSuccess("Postes de l'employe mis a jour avec succes!");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.updateWorkstations));
    },
  });
  const deleteEmployee = useDeleteEmployeeMutation({
    onSuccess: () => {
      setEditingEmployee(null);
      setEditingWorkstations([]);
      toastSuccess("Employe supprime avec succes.");
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.deleteEmployee));
    },
  });
  const resendWelcomeEmail = useResendWelcomeEmailMutation({
    onSuccess: (data) => {
      toastSuccess(
        data?.emailSent
          ? "E-mail de bienvenue renvoye avec succes."
          : "E-mail envoye.",
      );
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.resendWelcomeEmail));
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
  const assignTaskFromTemplate = useAssignTaskFromTemplateMutation({
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
      toastSuccess("Modele mis a jour avec succes!");
      // Note: Modal closing is handled in ManagerDashboard component's onSuccess callback
    },
    onError: (err) => {
      toastError(getErrorMessage(err, FALLBACK.updateTemplate));
      // Note: Modal stays open on error so user can retry
    },
  });
  const deleteTaskTemplate = useDeleteTaskTemplateMutation({
    onSuccess: () => {
      toastSuccess("Modele supprime avec succes!");
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
    deleteEmployee,
    resendWelcomeEmail,
    createTaskTemplate,
    assignTaskFromTemplate,
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
            ? `Tache "${title}" affectee a ${name}`
            : title
              ? `Tache "${title}" affectee`
              : name
                ? `Tache affectee a ${name}`
                : "Tache affectee";
        toastSuccess(message);
      },
    );

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, queryClient]);
}
