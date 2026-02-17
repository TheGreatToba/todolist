import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithCsrf } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { DailyTask } from '@shared/api';
import { Check, Loader2, LogOut, X, AlertCircle, Calendar } from 'lucide-react';
import { logger } from '@/lib/logger';

/** Current date in local timezone as YYYY-MM-DD (for "today" logic and date picker). */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === todayLocalISO();
}

function formatTaskDateLabel(dateStr: string): string {
  if (isToday(dateStr)) return "Today's Tasks";
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' - Tasks';
}

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const { on } = useSocket();
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocalISO());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    title: string;
    description?: string;
  } | null>(null);

  const fetchDailyTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = selectedDate ? `/api/tasks/daily?date=${encodeURIComponent(selectedDate)}` : '/api/tasks/daily';
      const response = await fetch(url, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data);
      }
    } catch (error) {
      logger.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDailyTasks();
  }, [fetchDailyTasks]);

  useEffect(() => {
    // Listen for real-time task updates (only refetch if viewing today)
    const unsubscribeUpdate = on('task:updated', (data) => {
      logger.debug('Task updated:', data);
      if (isToday(selectedDate)) fetchDailyTasks();
    });

    // Listen for new task assignments
    const unsubscribeAssigned = on('task:assigned', (data) => {
      if (data.employeeId === user?.id) {
        logger.debug('New task assigned:', data);
        setNotification({
          title: data.taskTitle,
          description: data.taskDescription,
        });
        if (isToday(selectedDate)) {
          setTimeout(() => fetchDailyTasks(), 500);
        }
        setTimeout(() => setNotification(null), 6000);
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, user?.id, selectedDate, fetchDailyTasks]);

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    try {
      setUpdatingTaskId(taskId);
      const response = await fetchWithCsrf(`/api/tasks/daily/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });

      if (response.ok) {
        const updatedTask = await response.json();
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updatedTask : t)));
      }
    } catch (error) {
      logger.error('Failed to update task:', error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{formatTaskDateLabel(selectedDate)}</h1>
              <p className="text-sm text-muted-foreground">Welcome, {user?.name}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" aria-hidden />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Select date"
                />
              </label>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 max-w-sm animate-in slide-in-from-top-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900">New Task Assigned</p>
                <p className="text-sm text-blue-800 mt-1">{notification.title}</p>
                {notification.description && (
                  <p className="text-xs text-blue-700 mt-1">{notification.description}</p>
                )}
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-blue-600 hover:text-blue-900 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Card */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {isToday(selectedDate) ? "Today's Progress" : `Progress for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString()}`}
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {completedCount}<span className="text-lg text-muted-foreground">/{totalCount}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-primary">{progressPercent}%</p>
              <p className="text-xs text-muted-foreground mt-1">Complete</p>
            </div>
          </div>
          <div className="w-full bg-border rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-primary/80 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="max-w-2xl mx-auto px-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">All tasks completed!</h3>
            <p className="text-muted-foreground">
              {isToday(selectedDate)
                ? "Great job! You've finished all your tasks for today."
                : `No tasks for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString()}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`bg-card rounded-xl border border-border p-4 transition-all ${
                  task.isCompleted ? 'bg-secondary/30 border-primary/20' : 'hover:border-primary/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleToggleTask(task.id, task.isCompleted)}
                    disabled={updatingTaskId === task.id}
                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-1 ${
                      task.isCompleted
                        ? 'bg-primary border-primary'
                        : 'border-border hover:border-primary bg-background'
                    } disabled:opacity-50`}
                  >
                    {updatingTaskId === task.id ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : task.isCompleted ? (
                      <Check className="w-4 h-4 text-primary-foreground" />
                    ) : null}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3
                          className={`font-semibold transition-all ${
                            task.isCompleted
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          }`}
                        >
                          {task.taskTemplate.title}
                        </h3>
                        {task.taskTemplate.description && (
                          <p
                            className={`text-sm mt-1 ${
                              task.isCompleted ? 'text-muted-foreground/60' : 'text-muted-foreground'
                            }`}
                          >
                            {task.taskTemplate.description}
                          </p>
                        )}
                        {task.taskTemplate.workstation && (
                          <p className="text-xs text-muted-foreground mt-2">
                            WS: {task.taskTemplate.workstation.name}
                          </p>
                        )}
                      </div>
                      {task.completedAt && (
                        <div className="text-xs text-primary font-medium flex-shrink-0">
                          Done
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
