/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

// Auth types
export interface User {
  id: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "MANAGER";
  teamId?: string | null;
}

/** Legacy alias kept for backwards compatibility. */
export interface AuthResponse {
  user: User;
}

/** Response payload for POST /api/auth/login */
export interface LoginResponse {
  user: User;
}

/** Response payload for POST /api/auth/signup */
export interface SignupResponse {
  user: User;
}

/** Response payload for GET /api/auth/profile */
export type ProfileResponse = AuthResponse;
export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  password?: string;
}
export interface UpdateProfileResponse {
  user: User;
}

/** Response payload for POST /api/auth/set-password */
export interface SetPasswordResponse {
  success: boolean;
  user: User;
}

/** Request payload for POST /api/auth/forgot-password */
export interface ForgotPasswordRequest {
  email: string;
}

/** Response payload for POST /api/auth/forgot-password */
export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  expiryHours: number;
}

/** Request payload for POST /api/auth/reset-password */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/** Response payload for POST /api/auth/reset-password */
export interface ResetPasswordResponse {
  success: boolean;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Signup is only available for MANAGER. Employees are created by managers from the dashboard. */
export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  role: "MANAGER";
}

// Task types (aligned with backend JSON: description and assignment ids can be null from DB)
export interface TaskTemplate {
  id: string;
  title: string;
  description?: string | null;
  workstationId?: string | null;
  assignedToEmployeeId?: string | null;
  isRecurring: boolean;
  recurrenceType?: "daily" | "weekly" | "x_per_week";
  recurrenceDays?: number[] | null;
  targetPerWeek?: number | null;
  notifyEmployee: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTask {
  id: string;
  taskTemplateId: string;
  employeeId?: string | null;
  date: string;
  status?: "UNASSIGNED" | "ASSIGNED" | "DONE";
  isCompleted: boolean;
  completedAt?: string;
  taskTemplate: {
    id: string;
    title: string;
    description?: string;
    isRecurring: boolean;
    workstation?: {
      id: string;
      name: string;
    };
  };
}

export interface CreateTaskTemplateRequest {
  title: string;
  description?: string;
  workstationId?: string;
  assignedToEmployeeId?: string;
  isRecurring?: boolean;
  recurrenceType?: "daily" | "weekly" | "x_per_week";
  recurrenceDays?: number[];
  targetPerWeek?: number;
  notifyEmployee?: boolean;
  date?: string;
}

export interface AssignTaskFromTemplateRequest {
  templateId: string;
  assignmentType: "workstation" | "employee";
  workstationId?: string;
  assignedToEmployeeId?: string;
  notifyEmployee?: boolean;
  date?: string;
}

export interface UpdateTaskTemplateRequest {
  title?: string;
  description?: string | null;
  workstationId?: string | null;
  assignedToEmployeeId?: string | null;
  isRecurring?: boolean;
  recurrenceType?: "daily" | "weekly" | "x_per_week";
  recurrenceDays?: number[] | null;
  targetPerWeek?: number | null;
  notifyEmployee?: boolean;
}

export interface TaskTemplateWithRelations extends TaskTemplate {
  workstation?: {
    id: string;
    name: string;
  } | null;
  assignedToEmployee?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface UpdateDailyTaskRequest {
  isCompleted?: boolean;
  employeeId?: string;
}

export interface UpdateWorkstationEmployeesRequest {
  employeeIds: string[];
}

/** One item in GET /api/team/members response (manager dashboard team members list). */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  workstations: Array<{ id: string; name: string }>;
}

export interface ManagerDashboard {
  team: {
    id: string;
    name: string;
    members: Array<{
      id: string;
      name: string;
      email: string;
    }>;
  };
  date: string;
  dailyTasks: Array<
    DailyTask & {
      employee: {
        id: string;
        name: string;
        email: string;
      };
    }
  >;
  workstations: Array<{
    id: string;
    name: string;
  }>;
  dayPreparation?: {
    recurringTemplatesTotal: number;
    recurringUnassignedCount: number;
    isPrepared: boolean;
    preparedAt?: string | null;
    unassignedRecurringTemplates: Array<{
      templateId: string;
      title: string;
      workstation?: {
        id: string;
        name: string;
      } | null;
      suggestedEmployees: Array<{
        id: string;
        name: string;
        email: string;
      }>;
      defaultEmployeeId?: string | null;
    }>;
  };
}
