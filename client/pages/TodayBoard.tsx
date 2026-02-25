import React, { useEffect, useState } from "react";
import type { TodayBoardTask } from "@shared/api";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateTodayBoardTaskMutation,
  useCreateTaskFromTemplateMutation,
  useManagerTodayBoardQuery,
  useManualTriggerTemplatesQuery,
  useTeamMembersQuery,
  useUpdateDailyTaskMutation,
} from "@/hooks/queries";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toastError } from "@/lib/toast";
import { getErrorMessage } from "@/lib/get-error-message";

function formatBoardDate(dateYmd: string): string {
  const parsed = new Date(`${dateYmd}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateYmd;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskSection({
  title,
  accentClass,
  emptyMessage,
  tasks,
  pendingTaskId,
  isTaskUpdating,
  onToggleTask,
}: {
  title: string;
  accentClass: string;
  emptyMessage: string;
  tasks: TodayBoardTask[];
  pendingTaskId: string | null;
  isTaskUpdating: boolean;
  onToggleTask: (task: TodayBoardTask) => void;
}) {
  return (
    <section className={`rounded-xl border bg-card shadow-sm ${accentClass}`}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div className="space-y-3 p-4">
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        {tasks.map((task) => (
          <article
            key={task.id}
            className="rounded-lg border border-border bg-background px-3 py-3"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onToggleTask(task)}
                disabled={isTaskUpdating && pendingTaskId === task.id}
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50 ${
                  task.isCompleted
                    ? "border-primary bg-primary"
                    : "border-border bg-card hover:border-primary"
                }`}
                aria-label={
                  task.isCompleted
                    ? `Mark task ${task.taskTemplate.title} as pending`
                    : `Mark task ${task.taskTemplate.title} as done`
                }
              >
                {task.isCompleted && (
                  <svg
                    className="h-3 w-3 text-primary-foreground"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    task.isCompleted
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.taskTemplate.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.employee
                    ? `Assigned to ${task.employee.name}`
                    : "Unassigned"}
                </p>
                {task.completedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed at {formatTime(task.completedAt)}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function TodayBoard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: board, isLoading } = useManagerTodayBoardQuery();
  const { data: teamMembers = [] } = useTeamMembersQuery();
  const { data: manualTriggerTemplates = [], isLoading: isTemplatesLoading } =
    useManualTriggerTemplatesQuery();
  const updateDailyTask = useUpdateDailyTaskMutation();
  const createTodayTask = useCreateTodayBoardTaskMutation();
  const createFromTemplate = useCreateTaskFromTemplateMutation();

  const [title, setTitle] = useState("");
  const [assignedToEmployeeId, setAssignedToEmployeeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isTemplatePopoverOpen, setIsTemplatePopoverOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const filteredManualTemplates = manualTriggerTemplates.filter((template) => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      template.title.toLowerCase().includes(q) ||
      (template.description ?? "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (board?.date && dueDate === "") {
      setDueDate(board.date);
    }
  }, [board?.date, dueDate]);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError("Please enter a task title.");
      return;
    }

    try {
      await createTodayTask.mutateAsync({
        title: title.trim(),
        dueDate: dueDate || board?.date,
        assignedToEmployeeId: assignedToEmployeeId || undefined,
      });
      setTitle("");
      setAssignedToEmployeeId("");
      setDueDate(board?.date ?? "");
    } catch (error) {
      toastError(getErrorMessage(error, "Failed to create task."));
    }
  };

  const handleToggleTask = async (task: TodayBoardTask) => {
    try {
      await updateDailyTask.mutateAsync({
        taskId: task.id,
        isCompleted: !task.isCompleted,
      });
    } catch (error) {
      toastError(getErrorMessage(error, "Failed to update task."));
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    try {
      await createFromTemplate.mutateAsync({ templateId });
      setIsTemplatePopoverOpen(false);
      setTemplateSearch("");
    } catch (error) {
      toastError(
        getErrorMessage(error, "Failed to create task from template."),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">Team not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please contact your administrator.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="border-b border-border bg-card/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Today Board</h1>
            <p className="text-sm text-muted-foreground">
              {formatBoardDate(board.date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/manager")}
              className="rounded-lg border border-input px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              Tasks history
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              + New task
            </h2>
            <Popover
              open={isTemplatePopoverOpen}
              onOpenChange={setIsTemplatePopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  Create from template
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="end">
                <label className="sr-only" htmlFor="today-template-search">
                  Search manual templates
                </label>
                <input
                  id="today-template-search"
                  type="text"
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                  placeholder="Search manual templates..."
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {isTemplatesLoading ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      Loading templates...
                    </p>
                  ) : null}
                  {!isTemplatesLoading &&
                  filteredManualTemplates.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      No manual templates found.
                    </p>
                  ) : null}
                  {filteredManualTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className="w-full rounded-md border border-border px-2 py-2 text-left transition hover:bg-secondary disabled:opacity-50"
                      onClick={() => void handleCreateFromTemplate(template.id)}
                      disabled={createFromTemplate.isPending}
                    >
                      <span className="block truncate text-sm font-medium text-foreground">
                        {template.title}
                      </span>
                      {template.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <form
            className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto]"
            onSubmit={handleCreateTask}
          >
            <label className="sr-only" htmlFor="today-task-title">
              Task title
            </label>
            <input
              id="today-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <label className="sr-only" htmlFor="today-task-assignee">
              Assignment
            </label>
            <select
              id="today-task-assignee"
              value={assignedToEmployeeId}
              onChange={(e) => setAssignedToEmployeeId(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="today-task-due-date">
              Due date
            </label>
            <input
              id="today-task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <button
              type="submit"
              disabled={createTodayTask.isPending}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {createTodayTask.isPending ? "Creating..." : "+ New task"}
            </button>
          </form>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <TaskSection
            title="Overdue"
            accentClass="border-l-4 border-l-red-500"
            emptyMessage="No overdue tasks."
            tasks={board.overdue}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Today"
            accentClass="border-l-4 border-l-amber-500"
            emptyMessage="No pending tasks for today."
            tasks={board.today}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
          <TaskSection
            title="Completed"
            accentClass="border-l-4 border-l-emerald-500"
            emptyMessage="No completed tasks yet."
            tasks={board.completedToday}
            pendingTaskId={updateDailyTask.variables?.taskId ?? null}
            isTaskUpdating={updateDailyTask.isPending}
            onToggleTask={handleToggleTask}
          />
        </div>
      </main>
    </div>
  );
}
