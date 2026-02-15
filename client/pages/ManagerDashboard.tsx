import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { ManagerDashboard as ManagerDashboardType } from '@shared/api';
import { Loader2, LogOut, Plus, Filter, Settings, Trash2, Users, X, Edit2, Calendar, Download } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  workstations: Array<{ id: string; name: string }>;
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { on } = useSocket();
  const [dashboard, setDashboard] = useState<ManagerDashboardType | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedWorkstation, setSelectedWorkstation] = useState<string | null>(null);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'workstations' | 'employees'>('tasks');
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [editingWorkstations, setEditingWorkstations] = useState<string[]>([]);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    workstationId: '',
    assignedToEmployeeId: '',
    assignmentType: 'workstation' as 'workstation' | 'employee',
    notifyEmployee: true,
  });
  const [newWorkstation, setNewWorkstation] = useState('');
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    password: '',
    workstationIds: [] as string[],
  });
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedDate) params.set('date', selectedDate);
      if (selectedEmployee) params.set('employeeId', selectedEmployee);
      if (selectedWorkstation) params.set('workstationId', selectedWorkstation);
      const url = `/api/manager/dashboard${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDashboard(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkstations();
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [selectedDate, selectedEmployee, selectedWorkstation]);

  useEffect(() => {
    const unsubscribeUpdate = on('task:updated', () => {
      fetchDashboard();
    });

    const unsubscribeAssigned = on('task:assigned', (data) => {
      setOperationSuccess(`Task "${data.taskTitle}" assigned to ${data.employeeName}`);
      setTimeout(() => setOperationSuccess(null), 5000);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeAssigned();
    };
  }, [on, selectedDate, selectedEmployee]);

  const fetchWorkstations = async () => {
    try {
      const response = await fetch('/api/workstations', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWorkstations(data);
      }
    } catch (error) {
      console.error('Failed to fetch workstations:', error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team/members', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data);
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  };

  const handleCreateWorkstation = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError(null);
    setOperationSuccess(null);

    if (!newWorkstation.trim()) {
      setOperationError('Please enter a workstation name');
      return;
    }

    try {
      const response = await fetch('/api/workstations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: newWorkstation }),
      });

      const data = await response.json();

      if (response.ok) {
        setNewWorkstation('');
        setOperationSuccess('Workstation created successfully!');
        await fetchWorkstations();
      } else {
        setOperationError(data.error || 'Failed to create workstation');
      }
    } catch (error) {
      setOperationError('An error occurred');
      console.error('Failed to create workstation:', error);
    }
  };

  const handleDeleteWorkstation = async (workstationId: string) => {
    if (!confirm('Are you sure you want to delete this workstation?')) return;

    try {
      const response = await fetch(`/api/workstations/${workstationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        setOperationSuccess('Workstation deleted successfully!');
        await fetchWorkstations();
      } else {
        const data = await response.json();
        setOperationError(data.error || 'Failed to delete workstation');
      }
    } catch (error) {
      setOperationError('An error occurred');
      console.error('Failed to delete workstation:', error);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError(null);
    setOperationSuccess(null);

    if (!newEmployee.name || !newEmployee.email || !newEmployee.password || newEmployee.workstationIds.length === 0) {
      setOperationError('Please fill in all fields and select at least one workstation');
      return;
    }

    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newEmployee),
      });

      const data = await response.json();

      if (response.ok) {
        setNewEmployee({ name: '', email: '', password: '', workstationIds: [] });
        setOperationSuccess(`Employee created successfully!${data.emailSent ? ' Email sent.' : ' (Email delivery skipped)'}`);
        await fetchTeamMembers();
      } else {
        setOperationError(data.error || 'Failed to create employee');
      }
    } catch (error) {
      setOperationError('An error occurred');
      console.error('Failed to create employee:', error);
    }
  };

  const handleUpdateEmployeeWorkstations = async (employeeId: string) => {
    if (editingWorkstations.length === 0) {
      setOperationError('Please select at least one workstation');
      return;
    }

    try {
      const response = await fetch(`/api/employees/${employeeId}/workstations`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ workstationIds: editingWorkstations }),
      });

      const data = await response.json();

      if (response.ok) {
        setEditingEmployee(null);
        setEditingWorkstations([]);
        setOperationSuccess('Employee workstations updated successfully!');
        await fetchTeamMembers();
      } else {
        setOperationError(data.error || 'Failed to update employee');
      }
    } catch (error) {
      setOperationError('An error occurred');
      console.error('Failed to update employee:', error);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTask.title) {
      alert('Please fill in the task title');
      return;
    }

    if (newTask.assignmentType === 'workstation' && !newTask.workstationId) {
      alert('Please select a workstation');
      return;
    }

    if (newTask.assignmentType === 'employee' && !newTask.assignedToEmployeeId) {
      alert('Please select an employee');
      return;
    }

    try {
      const payload = {
        title: newTask.title,
        description: newTask.description,
        notifyEmployee: newTask.notifyEmployee,
        ...(newTask.assignmentType === 'workstation' && { workstationId: newTask.workstationId }),
        ...(newTask.assignmentType === 'employee' && { assignedToEmployeeId: newTask.assignedToEmployeeId }),
      };

      const response = await fetch('/api/tasks/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setNewTask({ title: '', description: '', workstationId: '', assignedToEmployeeId: '', assignmentType: 'workstation', notifyEmployee: true });
        setShowNewTaskModal(false);
        await fetchDashboard();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('An error occurred while creating the task');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Team not found</h2>
          <p className="text-muted-foreground mb-6">Please contact your administrator</p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Filter by workstation is done server-side via API params; client receives pre-filtered data
  const filteredTasks = dashboard.dailyTasks;

  const completedCount = filteredTasks.filter((t) => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group tasks by workstation (or "Direct assignments" for tasks without workstation), then by employee
  const DIRECT_ASSIGNMENTS_ID = '__direct__';
  const tasksByWorkstation = filteredTasks.reduce(
    (acc, task) => {
      const wsId = task.taskTemplate.workstation?.id ?? DIRECT_ASSIGNMENTS_ID;
      const wsName = task.taskTemplate.workstation?.name ?? 'Direct assignments';

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
    },
    {} as Record<string, { id: string; name: string; tasksByEmployee: Record<string, any> }>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{dashboard.team.name}</h1>
              <p className="text-sm text-muted-foreground">Manager Dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-t border-border pt-4">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === 'tasks'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setActiveTab('workstations')}
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === 'workstations'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Workstations
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-2 font-medium transition border-b-2 ${
                activeTab === 'employees'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Employees
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <>
            {/* Notifications */}
            {operationError && (
              <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive flex items-center justify-between">
                <span>{operationError}</span>
                <button
                  onClick={() => setOperationError(null)}
                  className="text-destructive hover:opacity-70"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {operationSuccess && (
              <div className="mb-6 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary flex items-center justify-between">
                <span>{operationSuccess}</span>
                <button
                  onClick={() => setOperationSuccess(null)}
                  className="text-primary hover:opacity-70"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <p className="text-sm text-muted-foreground font-medium">Team Members</p>
                <p className="text-3xl font-bold text-foreground mt-2">{teamMembers.length}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <p className="text-sm text-muted-foreground font-medium">Today's Tasks</p>
                <p className="text-3xl font-bold text-foreground mt-2">{totalCount}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <p className="text-sm text-muted-foreground font-medium">Completion Rate</p>
                <p className="text-3xl font-bold text-primary mt-2">{progressPercent}%</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground">Overall Progress</h2>
                <span className="text-sm text-muted-foreground">
                  {completedCount} of {totalCount} tasks completed
                </span>
              </div>
              <div className="w-full bg-border rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-primary/80 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Quick date shortcuts (history) */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-sm text-muted-foreground self-center">History:</span>
              {[...Array(8)].map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `-${i} days`;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      selectedDate === dateStr
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/50 text-foreground hover:bg-secondary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Filters and Actions */}
            <div className="flex flex-wrap items-center gap-2 mb-6 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <select
                  value={selectedEmployee || ''}
                  onChange={(e) => setSelectedEmployee(e.target.value || null)}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All Employees</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedWorkstation || ''}
                  onChange={(e) => setSelectedWorkstation(e.target.value || null)}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All Workstations</option>
                  <option value="__direct__">Direct assignments</option>
                  {dashboard.workstations.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const headers = ['Date', 'Employee', 'Workstation', 'Task', 'Status', 'Completed At'];
                    const rows = filteredTasks.map((t) => [
                      selectedDate,
                      t.employee.name,
                      t.taskTemplate.workstation?.name ?? 'Direct',
                      t.taskTemplate.title,
                      t.isCompleted ? 'Completed' : 'Pending',
                      t.completedAt ? new Date(t.completedAt).toLocaleString() : '',
                    ]);
                    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tasks-${selectedDate}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-input hover:bg-secondary text-foreground rounded-lg font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => setShowNewTaskModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
                >
                  <Plus className="w-4 h-4" />
                  New Task
                </button>
              </div>
            </div>

            {/* Tasks by Workstation, then by Employee */}
            <div className="space-y-8">
              {Object.values(tasksByWorkstation).length === 0 ? (
                <div className="text-center py-12 bg-card rounded-xl border border-border">
                  <p className="text-muted-foreground">No tasks found</p>
                </div>
              ) : (
                Object.values(tasksByWorkstation).map((workstation) => (
                  <div key={workstation.id} className="border-t border-border pt-8 first:border-t-0 first:pt-0">
                    <h3 className="text-lg font-semibold text-foreground mb-4">{workstation.name}</h3>
                    <div className="space-y-4">
                      {Object.values(workstation.tasksByEmployee).map(({ employee, tasks }) => {
                        const empCompletedCount = tasks.filter((t) => t.isCompleted).length;
                        const empProgressPercent = tasks.length > 0 ? Math.round((empCompletedCount / tasks.length) * 100) : 0;

                        return (
                          <div key={employee.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-border bg-secondary/30">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold text-foreground">{employee.name}</h4>
                                  <p className="text-sm text-muted-foreground">{employee.email}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-bold text-primary">{empProgressPercent}%</p>
                                  <p className="text-xs text-muted-foreground">
                                    {empCompletedCount}/{tasks.length}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="px-6 py-4 space-y-2">
                              {tasks.map((task) => (
                                <div key={task.id} className="flex items-center gap-3">
                                  <div
                                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                      task.isCompleted
                                        ? 'bg-primary border-primary'
                                        : 'border-border bg-background'
                                    }`}
                                  >
                                    {task.isCompleted && (
                                      <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <p
                                      className={`text-sm font-medium transition-all ${
                                        task.isCompleted
                                          ? 'text-muted-foreground line-through'
                                          : 'text-foreground'
                                      }`}
                                    >
                                      {task.taskTemplate.title}
                                    </p>
                                    {task.taskTemplate.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {task.taskTemplate.description}
                                      </p>
                                    )}
                                  </div>
                                  {task.isCompleted && (
                                    <span className="text-xs font-medium text-primary">✓ Done</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Workstations Tab */}
        {activeTab === 'workstations' && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground mb-4">Manage Workstations</h2>

              {operationError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive mb-4">
                  {operationError}
                </div>
              )}

              {operationSuccess && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary mb-4">
                  {operationSuccess}
                </div>
              )}

              <form onSubmit={handleCreateWorkstation} className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newWorkstation}
                  onChange={(e) => setNewWorkstation(e.target.value)}
                  placeholder="e.g., Checkout, Kitchen, Reception"
                  className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
                >
                  Add Workstation
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workstations.map((ws) => (
                <div key={ws.id} className="bg-card rounded-xl border border-border p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground text-lg">{ws.name}</h3>
                    <button
                      onClick={() => handleDeleteWorkstation(ws.id)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ws.employees?.length || 0} employee{ws.employees?.length !== 1 ? 's' : ''}
                  </p>
                  {ws.employees && ws.employees.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Assigned to:</p>
                      <div className="space-y-1">
                        {ws.employees.map((ew: any) => (
                          <p key={ew.employee.id} className="text-sm text-foreground">
                            • {ew.employee.name}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground mb-4">Create New Employee</h2>

              {operationError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive mb-4">
                  {operationError}
                </div>
              )}

              {operationSuccess && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary mb-4">
                  {operationSuccess}
                </div>
              )}

              <form onSubmit={handleCreateEmployee} className="bg-card rounded-xl border border-border p-6 shadow-sm mb-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newEmployee.name}
                      onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                      placeholder="John Doe"
                      className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                    <input
                      type="email"
                      required
                      value={newEmployee.email}
                      onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                      placeholder="john@example.com"
                      className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                    <input
                      type="password"
                      required
                      value={newEmployee.password}
                      onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Workstations (Select one or more)</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                      {workstations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No workstations available. Create one in the Workstations tab first.</p>
                      ) : (
                        workstations.map((ws) => (
                          <label key={ws.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newEmployee.workstationIds.includes(ws.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewEmployee({
                                    ...newEmployee,
                                    workstationIds: [...newEmployee.workstationIds, ws.id],
                                  });
                                } else {
                                  setNewEmployee({
                                    ...newEmployee,
                                    workstationIds: newEmployee.workstationIds.filter((id) => id !== ws.id),
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded border-input"
                            />
                            <span className="text-sm text-foreground">{ws.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
                >
                  Create Employee
                </button>
              </form>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-4">Team Members ({teamMembers.length})</h3>
            <div className="space-y-3">
              {teamMembers.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-xl border border-border">
                  <p className="text-muted-foreground">No employees yet. Create one above!</p>
                </div>
              ) : (
                teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className={`bg-card rounded-lg border transition ${
                      editingEmployee === member.id ? 'border-primary' : 'border-border'
                    } p-4`}
                  >
                    {editingEmployee === member.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                          {workstations.map((ws) => (
                            <label key={ws.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingWorkstations.includes(ws.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditingWorkstations([...editingWorkstations, ws.id]);
                                  } else {
                                    setEditingWorkstations(editingWorkstations.filter((id) => id !== ws.id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-input"
                              />
                              <span className="text-sm text-foreground">{ws.name}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateEmployeeWorkstations(member.id)}
                            className="flex-1 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingEmployee(null);
                              setEditingWorkstations([]);
                            }}
                            className="flex-1 px-3 py-2 border border-input text-foreground hover:bg-secondary rounded-lg transition text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                          {member.workstations.length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-2">
                              {member.workstations.map((ws) => (
                                <span
                                  key={ws.id}
                                  className="inline-block px-2 py-1 bg-primary/15 text-primary text-xs rounded-full"
                                >
                                  {ws.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingEmployee(member.id);
                            setEditingWorkstations(member.workstations.map((ws) => ws.id));
                          }}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                          title="Edit workstations"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-lg max-w-md w-full p-6 border border-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Create New Task</h2>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="p-1 hover:bg-secondary rounded-lg transition"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Task Title</label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="e.g., Clean the workstation"
                  className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Assign To</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition" style={{ borderColor: newTask.assignmentType === 'workstation' ? 'var(--primary)' : 'var(--border)' }}>
                    <input
                      type="radio"
                      checked={newTask.assignmentType === 'workstation'}
                      onChange={() => {
                        setNewTask({ ...newTask, assignmentType: 'workstation', assignedToEmployeeId: '' });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-foreground">Workstation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-lg border-2 transition" style={{ borderColor: newTask.assignmentType === 'employee' ? 'var(--primary)' : 'var(--border)' }}>
                    <input
                      type="radio"
                      checked={newTask.assignmentType === 'employee'}
                      onChange={() => {
                        setNewTask({ ...newTask, assignmentType: 'employee', workstationId: '' });
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-foreground">Employee</span>
                  </label>
                </div>
              </div>

              {newTask.assignmentType === 'workstation' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Workstation</label>
                  <select
                    required
                    value={newTask.workstationId}
                    onChange={(e) => setNewTask({ ...newTask, workstationId: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a workstation</option>
                    {dashboard.workstations.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newTask.assignmentType === 'employee' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Employee</label>
                  <select
                    required
                    value={newTask.assignedToEmployeeId}
                    onChange={(e) => setNewTask({ ...newTask, assignedToEmployeeId: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select an employee</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description (optional)</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add any additional details..."
                  className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-secondary">
                <input
                  type="checkbox"
                  id="notifyEmployee"
                  checked={newTask.notifyEmployee}
                  onChange={(e) => setNewTask({ ...newTask, notifyEmployee: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="notifyEmployee" className="text-sm text-foreground cursor-pointer flex-1">
                  Notify employee when task is assigned
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition font-medium"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
