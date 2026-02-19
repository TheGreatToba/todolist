/**
 * React Query keys and hooks for API data.
 * Uses fetch with credentials for GET, fetchWithCsrf for mutations.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type {
  ManagerDashboard as ManagerDashboardType,
  DailyTask,
  ProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UpdateDailyTaskRequest,
  User,
  TeamMember,
  ForgotPasswordResponse,
  ResetPasswordResponse,
  TaskTemplateWithRelations,
  UpdateTaskTemplateRequest,
  UpdateWorkstationEmployeesRequest,
} from "@shared/api";
import { api, fetchWithCsrf, parseApiError } from "@/lib/api";

// ---------- Query keys ----------
/** Prefix keys for invalidation (match all queries starting with this key). */
export const queryKeys = {
  auth: {
    profile: ["auth", "profile"] as const,
  },
  manager: {
    dashboard: (params: {
      date?: string;
      employeeId?: string | null;
      workstationId?: string | null;
    }) => ["manager", "dashboard", params] as const,
    dashboardPrefix: ["manager", "dashboard"] as const,
    workstations: ["manager", "workstations"] as const,
    teamMembers: ["manager", "teamMembers"] as const,
    taskTemplates: ["manager", "taskTemplates"] as const,
  },
  tasks: {
    daily: (date: string) => ["tasks", "daily", date] as const,
    dailyPrefix: ["tasks", "daily"] as const,
  },
};

// ---------- Fetchers (GET) ----------
async function fetchJson<T>(url: string): Promise<T> {
  const res = await api.get(url);
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<T>;
}

export type ProfileResult = ProfileResponse | { user: null };

/** 401/403 -> { user: null }; other errors (network, 5xx) propagate for UX/debug. */
export async function fetchProfile(): Promise<ProfileResult> {
  const res = await api.get("/api/auth/profile");
  if (res.status === 401 || res.status === 403) return { user: null };
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json() as Promise<ProfileResponse>;
}

export async function fetchManagerDashboard(params: {
  date?: string;
  employeeId?: string | null;
  workstationId?: string | null;
}): Promise<ManagerDashboardType | null> {
  const search = new URLSearchParams();
  if (params.date) search.set("date", params.date);
  if (params.employeeId) search.set("employeeId", params.employeeId);
  if (params.workstationId) search.set("workstationId", params.workstationId);
  const url = `/api/manager/dashboard${search.toString() ? `?${search.toString()}` : ""}`;
  const res = await api.get(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(await parseApiError(res));
  }
  return res.json() as Promise<ManagerDashboardType>;
}

export interface WorkstationEmployeeSummary {
  employee: { id: string; name: string; email: string };
}
export interface WorkstationWithEmployees {
  id: string;
  name: string;
  employees?: WorkstationEmployeeSummary[];
}

export async function fetchWorkstations(): Promise<WorkstationWithEmployees[]> {
  return fetchJson("/api/workstations");
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  return fetchJson("/api/team/members");
}

export async function fetchTaskTemplates(): Promise<
  TaskTemplateWithRelations[]
> {
  return fetchJson("/api/tasks/templates");
}

export async function fetchDailyTasks(date: string): Promise<DailyTask[]> {
  const url = date
    ? `/api/tasks/daily?date=${encodeURIComponent(date)}`
    : "/api/tasks/daily";
  return fetchJson<DailyTask[]>(url);
}

// ---------- Auth (profile) ----------
export function useProfileQuery(
  options?: Omit<UseQueryOptions<ProfileResult, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.auth.profile,
    queryFn: fetchProfile,
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ---------- Manager dashboard ----------
export function useManagerDashboardQuery(
  params: {
    date?: string;
    employeeId?: string | null;
    workstationId?: string | null;
  },
  options?: Omit<
    UseQueryOptions<ManagerDashboardType | null, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.manager.dashboard(params),
    queryFn: () => fetchManagerDashboard(params),
    ...options,
  });
}

export function useWorkstationsQuery(
  options?: Omit<
    UseQueryOptions<WorkstationWithEmployees[], Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.manager.workstations,
    queryFn: fetchWorkstations,
    ...options,
  });
}

export function useTeamMembersQuery(
  options?: Omit<UseQueryOptions<TeamMember[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.manager.teamMembers,
    queryFn: fetchTeamMembers,
    ...options,
  });
}

export function useTaskTemplatesQuery(
  options?: Omit<
    UseQueryOptions<TaskTemplateWithRelations[], Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.manager.taskTemplates,
    queryFn: fetchTaskTemplates,
    ...options,
  });
}

// ---------- Daily tasks (employee) ----------
export function useDailyTasksQuery(
  date: string,
  options?: Omit<UseQueryOptions<DailyTask[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.tasks.daily(date),
    queryFn: () => fetchDailyTasks(date),
    enabled: !!date,
    ...options,
  });
}

// ---------- Mutations ----------
export function useUpdateDailyTaskMutation(
  options?: UseMutationOptions<
    DailyTask,
    Error,
    { taskId: string } & UpdateDailyTaskRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      isCompleted,
      employeeId,
    }: {
      taskId: string;
      isCompleted?: boolean;
      employeeId?: string;
    }) => {
      const res = await fetchWithCsrf(`/api/tasks/daily/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isCompleted !== undefined ? { isCompleted } : {}),
          ...(employeeId !== undefined ? { employeeId } : {}),
        }),
      });
      if (!res.ok)
        throw new Error(await res.text().catch(() => res.statusText));
      return res.json() as Promise<DailyTask>;
    },
    ...options,
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.tasks.dailyPrefix }),
        queryClient.cancelQueries({
          queryKey: queryKeys.manager.dashboardPrefix,
        }),
      ]);

      const previousDaily = queryClient.getQueriesData<DailyTask[]>({
        queryKey: queryKeys.tasks.dailyPrefix,
      });
      const previousManager =
        queryClient.getQueriesData<ManagerDashboardType | null>({
          queryKey: queryKeys.manager.dashboardPrefix,
        });

      for (const [key, data] of previousDaily) {
        if (!Array.isArray(data)) continue;
        queryClient.setQueryData(
          key,
          data.map((task) => applyOptimisticTaskUpdate(task, variables, data)),
        );
      }

      for (const [key, data] of previousManager) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          ...data,
          dailyTasks: data.dailyTasks.map((task) =>
            applyOptimisticTaskUpdate(task, variables, data.dailyTasks),
          ),
        });
      }

      return { previousDaily, previousManager };
    },
    onError: (error, variables, ctx) => {
      if (ctx?.previousDaily) {
        for (const [key, data] of ctx.previousDaily) {
          queryClient.setQueryData(key, data);
        }
      }
      if (ctx?.previousManager) {
        for (const [key, data] of ctx.previousManager) {
          queryClient.setQueryData(key, data);
        }
      }
      options?.onError?.(error, variables, ctx);
    },
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.dailyPrefix });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

function applyOptimisticTaskUpdate<
  T extends DailyTask | ManagerDashboardType["dailyTasks"][number],
>(
  task: T,
  variables: { taskId: string; isCompleted?: boolean; employeeId?: string },
  tasks: T[],
): T {
  if (task.id !== variables.taskId) return task;

  const next = {
    ...task,
  } as T;

  if (variables.isCompleted !== undefined) {
    next.isCompleted = variables.isCompleted;
    next.completedAt = variables.isCompleted
      ? new Date().toISOString()
      : undefined;
  }

  if (variables.employeeId !== undefined) {
    const prevEmployeeId =
      "employee" in task ? task.employee.id : task.employeeId;
    if ("employee" in next) {
      const targetEmployee = tasks.find(
        (candidate) =>
          "employee" in candidate &&
          candidate.employee.id === variables.employeeId,
      );
      if (targetEmployee && "employee" in targetEmployee) {
        next.employee = targetEmployee.employee;
      }
    } else {
      next.employeeId = variables.employeeId;
    }
    if (prevEmployeeId !== variables.employeeId && task.isCompleted) {
      next.isCompleted = false;
      next.completedAt = undefined;
    }
  }

  return next;
}

export function useUpdateProfileMutation(
  options?: UseMutationOptions<
    UpdateProfileResponse,
    Error,
    UpdateProfileRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProfileRequest) => {
      const res = await fetchWithCsrf("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");
      return data as UpdateProfileResponse;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useCreateWorkstationMutation(
  options?: UseMutationOptions<
    { id: string; name: string },
    Error,
    { name: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const res = await fetchWithCsrf("/api/workstations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create workstation");
      return data;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.workstations,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useDeleteWorkstationMutation(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workstationId: string) => {
      const res = await fetchWithCsrf(`/api/workstations/${workstationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete workstation");
      }
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.workstations,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useUpdateWorkstationEmployeesMutation(
  options?: UseMutationOptions<
    WorkstationWithEmployees,
    Error,
    { workstationId: string } & UpdateWorkstationEmployeesRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workstationId,
      employeeIds,
    }: {
      workstationId: string;
      employeeIds: string[];
    }) => {
      const res = await fetchWithCsrf(
        `/api/workstations/${workstationId}/employees`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeIds }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update workstation employees");
      }
      return data as WorkstationWithEmployees;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.workstations,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.teamMembers,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useCreateEmployeeMutation(
  options?: UseMutationOptions<
    { emailSent?: boolean },
    Error,
    {
      name: string;
      email: string;
      workstationIds: string[];
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      email: string;
      workstationIds: string[];
    }) => {
      const res = await fetchWithCsrf("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create employee");
      return data;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.teamMembers,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useUpdateEmployeeWorkstationsMutation(
  options?: UseMutationOptions<
    void,
    Error,
    { employeeId: string; workstationIds: string[] }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      workstationIds,
    }: {
      employeeId: string;
      workstationIds: string[];
    }) => {
      const res = await fetchWithCsrf(
        `/api/employees/${employeeId}/workstations`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workstationIds }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update employee");
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.teamMembers,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useCreateTaskTemplateMutation(
  options?: UseMutationOptions<
    unknown,
    Error,
    {
      title: string;
      description?: string;
      workstationId?: string;
      assignedToEmployeeId?: string;
      assignmentType: "workstation" | "employee";
      notifyEmployee: boolean;
      isRecurring?: boolean;
    }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      workstationId?: string;
      assignedToEmployeeId?: string;
      assignmentType: "workstation" | "employee";
      notifyEmployee: boolean;
      isRecurring?: boolean;
    }) => {
      const body = {
        title: payload.title,
        description: payload.description,
        notifyEmployee: payload.notifyEmployee,
        isRecurring: payload.isRecurring,
        ...(payload.assignmentType === "workstation" && {
          workstationId: payload.workstationId,
        }),
        ...(payload.assignmentType === "employee" && {
          assignedToEmployeeId: payload.assignedToEmployeeId,
        }),
      };
      const res = await fetchWithCsrf("/api/tasks/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create task");
      return data;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.taskTemplates,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.dailyPrefix });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useUpdateTaskTemplateMutation(
  options?: UseMutationOptions<
    TaskTemplateWithRelations,
    Error,
    { templateId: string; data: UpdateTaskTemplateRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateId,
      data,
    }: {
      templateId: string;
      data: UpdateTaskTemplateRequest;
    }) => {
      const res = await fetchWithCsrf(`/api/tasks/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const responseData = await res.json();
      if (!res.ok)
        throw new Error(responseData.error || "Failed to update template");
      return responseData as TaskTemplateWithRelations;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.taskTemplates,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.dailyPrefix });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useDeleteTaskTemplateMutation(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetchWithCsrf(`/api/tasks/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete template");
      }
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.taskTemplates,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.manager.dashboardPrefix,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.dailyPrefix });
      options?.onSuccess?.(data, variables, ctx);
    },
  });
}

/** Uses fetchWithCsrf for consistency; server exempts this route (one-time token in body). */
export function useSetPasswordMutation(
  options?: UseMutationOptions<
    { user: User },
    Error,
    { token: string; password: string }
  >,
) {
  return useMutation({
    mutationFn: async ({
      token,
      password,
    }: {
      token: string;
      password: string;
    }) => {
      const res = await fetchWithCsrf("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(raw.error ?? "Failed to set password");
      return raw as { user: User };
    },
    ...options,
  });
}

export function useForgotPasswordMutation(
  options?: UseMutationOptions<
    ForgotPasswordResponse,
    Error,
    { email: string }
  >,
) {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const res = await fetchWithCsrf("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(raw.error ?? "Failed to send reset email");
      return raw as ForgotPasswordResponse;
    },
    ...options,
  });
}

export function useResetPasswordMutation(
  options?: UseMutationOptions<
    ResetPasswordResponse,
    Error,
    { token: string; password: string }
  >,
) {
  return useMutation({
    mutationFn: async ({
      token,
      password,
    }: {
      token: string;
      password: string;
    }) => {
      const res = await fetchWithCsrf("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(raw.error ?? "Failed to reset password");
      return raw as ResetPasswordResponse;
    },
    ...options,
  });
}
