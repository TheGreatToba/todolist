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
  role: 'EMPLOYEE' | 'MANAGER';
  teamId?: string;
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

/** Response payload for POST /api/auth/set-password */
export interface SetPasswordResponse {
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
  role: 'MANAGER';
}

// Task types
export interface TaskTemplate {
  id: string;
  title: string;
  description?: string;
  workstationId?: string;
  assignedToEmployeeId?: string;
  isRecurring: boolean;
  notifyEmployee: boolean;
  createdAt: string;
}

export interface DailyTask {
  id: string;
  taskTemplateId: string;
  employeeId: string;
  date: string;
  isCompleted: boolean;
  completedAt?: string;
  taskTemplate: {
    id: string;
    title: string;
    description?: string;
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
  notifyEmployee?: boolean;
}

export interface UpdateDailyTaskRequest {
  isCompleted: boolean;
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
  dailyTasks: Array<DailyTask & {
    employee: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  workstations: Array<{
    id: string;
    name: string;
  }>;
}
