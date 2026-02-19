import type { ManagerDashboard as ManagerDashboardType } from "@shared/api";

export type DashboardTask = ManagerDashboardType["dailyTasks"][number];

export interface TasksByEmployeeGroup {
  employee: DashboardTask["employee"];
  tasks: DashboardTask[];
}

export type TasksByWorkstationMap = Record<
  string,
  {
    id: string;
    name: string;
    tasksByEmployee: Record<string, TasksByEmployeeGroup>;
  }
>;

export const DIRECT_ASSIGNMENTS_ID = "__direct__";

export function buildTasksByWorkstation(
  dailyTasks: DashboardTask[],
): TasksByWorkstationMap {
  return dailyTasks.reduce<TasksByWorkstationMap>((acc, task) => {
    const wsId = task.taskTemplate.workstation?.id ?? DIRECT_ASSIGNMENTS_ID;
    const wsName = task.taskTemplate.workstation?.name ?? "Direct assignments";

    if (!acc[wsId]) {
      acc[wsId] = {
        id: wsId,
        name: wsName,
        tasksByEmployee: {},
      };
    }

    const empId = task.employee.id;
    if (!acc[wsId].tasksByEmployee[empId]) {
      acc[wsId].tasksByEmployee[empId] = {
        employee: task.employee,
        tasks: [],
      };
    }
    acc[wsId].tasksByEmployee[empId].tasks.push(task);
    return acc;
  }, {} as TasksByWorkstationMap);
}
