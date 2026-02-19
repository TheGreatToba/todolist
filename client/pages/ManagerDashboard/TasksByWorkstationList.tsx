import React from "react";
import type { TasksByWorkstationMap } from "./types";
import { EmployeeTaskCard } from "./EmployeeTaskCard";

interface TasksByWorkstationListProps {
  tasksByWorkstation: TasksByWorkstationMap;
}

export function TasksByWorkstationList({
  tasksByWorkstation,
}: TasksByWorkstationListProps) {
  const values = Object.values(tasksByWorkstation);

  if (values.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-xl border border-border">
        <p className="text-muted-foreground">No tasks found</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {values.map((workstation) => (
        <div
          key={workstation.id}
          className="border-t border-border pt-8 first:border-t-0 first:pt-0"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {workstation.name}
          </h3>
          <div className="space-y-4">
            {Object.values(workstation.tasksByEmployee).map(
              ({ employee, tasks }) => (
                <EmployeeTaskCard
                  key={employee.id}
                  group={{ employee, tasks }}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
