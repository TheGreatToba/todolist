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
  User,
} from "@shared/api";
import { fetchWithCsrf } from "@/lib/api";

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
  },
  tasks: {
    daily: (date: string) => ["tasks", "daily", date] as const,
    dailyPrefix: ["tasks", "daily"] as const,
  },
};

// ---------- Fetchers (GET) ----------
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json() as Promise<T>;
}

export type ProfileResult = ProfileResponse | { user: null };

/** 401/403 → { user: null }; other errors (network, 5xx) propagate for UX/debug. */
export async function fetchProfile(): Promise<ProfileResult> {
  const res = await fetch("/api/auth/profile", { credentials: "include" });
  if (res.status === 401 || res.status === 403) return { user: null };
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
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
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(await res.text().catch(() => res.statusText));
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

export async function fetchTeamMembers(): Promise<
  Array<{
    id: string;
    name: string;
    email: string;
    workstations: Array<{ id: string; name: string }>;
  }>
> {
  return fetchJson("/api/team/members");
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
  options?: Omit<
    UseQueryOptions<
      Array<{
        id: string;
        name: string;
        email: string;
        workstations: Array<{ id: string; name: string }>;
      }>,
      Error
    >,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.manager.teamMembers,
    queryFn: fetchTeamMembers,
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
    { taskId: string; isCompleted: boolean }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      isCompleted,
    }: {
      taskId: string;
      isCompleted: boolean;
    }) => {
      // Caller passes the new desired value (e.g. !current)
      const res = await fetchWithCsrf(`/api/tasks/daily/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted }),
      });
      if (!res.ok)
        throw new Error(await res.text().catch(() => res.statusText));
      return res.json() as Promise<DailyTask>;
    },
    ...options,
    onSuccess: (data, variables, ctx) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.dailyPrefix });
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
    }) => {
      const body = {
        title: payload.title,
        description: payload.description,
        notifyEmployee: payload.notifyEmployee,
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
