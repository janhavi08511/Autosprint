
import React, { useState, useEffect, useMemo } from 'react';
import {
  Task, TaskStatus, User, DecisionLog, ActionType, UserRole, Project
} from './types';
import { DEPARTMENTS, TEAMS } from './mockData';
import { runMonitoringCycle } from './agentService';
import { Icons, ALL_SKILLS } from './constants';
import { Auth } from './Auth';
import { ProjectManager } from './ProjectManager';
import { initMemories } from './vectorStore';
import { autoAssignTask, getSkillMatchPercentage } from './assignmentService';
import { SkillManager } from './SkillManager';
import { GanttChart } from './GanttChart';
import { userAPI, taskAPI, projectAPI, notificationAPI, Notification } from './api/client';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'LIST' | 'GANTT'>('LIST');
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DecisionLog[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastRun, setLastRun] = useState<number>(Date.now());
  const [showSkillManager, setShowSkillManager] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [loading, setLoading] = useState(true);

  const handleLogin = (user: User, token: string) => {
    localStorage.setItem('AEIP_ACCESS_TOKEN', token);
    setCurrentUser(user);
    localStorage.setItem('AEIP_CURRENT_USER', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsers([]);
    setTasks([]);
    setProjects([]);
    setNotifications([]);
    setLogs([]);
    localStorage.removeItem('AEIP_ACCESS_TOKEN');
    localStorage.removeItem('AEIP_CURRENT_USER');
  };

  // Restore a session only after validating its token with the backend.
  useEffect(() => {
    if (!localStorage.getItem('AEIP_ACCESS_TOKEN')) {
      setLoading(false);
      return;
    }
    userAPI.getMe()
      .then(user => {
        setCurrentUser(user);
        localStorage.setItem('AEIP_CURRENT_USER', JSON.stringify(user));
      })
      .catch(error => {
        console.error('Session validation failed:', error);
        localStorage.removeItem('AEIP_ACCESS_TOKEN');
        localStorage.removeItem('AEIP_CURRENT_USER');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      userAPI.getAssignable(),
      taskAPI.getAll(),
      projectAPI.getAll(),
      notificationAPI.getMine(),
    ])
      .then(([loadedUsers, loadedTasks, loadedProjects, loadedNotifications]) => {
        if (cancelled) return;
        setUsers(loadedUsers);
        setTasks(loadedTasks);
        setProjects(loadedProjects);
        setNotifications(loadedNotifications);
      })
      .catch(error => {
        if (!cancelled) {
          console.error('Failed to load authenticated workspace data:', error);
          setUsers([]);
          setTasks([]);
          setProjects([]);
          setNotifications([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    initMemories();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !selectedTaskId) return;
    let cancelled = false;
    taskAPI.getDecisionTraces(selectedTaskId)
      .then(traces => {
        if (cancelled) return;
        setLogs(previous => [
          ...previous.filter(log => log.taskId !== selectedTaskId),
          ...traces,
        ]);
      })
      .catch(error => {
        if (!cancelled) console.error('Failed to load persisted decision trace:', error);
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, selectedTaskId]);

  const handleNotificationTransition = async (
    notification: Notification,
    transition: 'acknowledge' | 'resolve'
  ) => {
    setNotificationError('');
    try {
      const updated = await notificationAPI[transition](notification.id);
      setNotifications(previous => previous.map(item => item.id === updated.id ? updated : item));
      const traces = await taskAPI.getDecisionTraces(notification.taskId);
      setLogs(previous => [
        ...previous.filter(log => log.taskId !== notification.taskId),
        ...traces,
      ]);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Notification update failed.');
    }
  };

  // Autonomous loop simulator
  const isMonitoringRef = React.useRef(false);

  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      if (isMonitoringRef.current) {
        console.log('⏳ Skipping monitoring cycle - previous cycle still active');
        return;
      }

      try {
        isMonitoringRef.current = true;
        setIsMonitoring(true);

        const monitoredTasks = currentUser.role === UserRole.ASSIGNEE
          ? tasks.filter(task => task.assigneeId === currentUser.id)
          : tasks;
        await runMonitoringCycle(
          monitoredTasks,
          users,
          (log) => setLogs(prev => [log, ...prev.filter(existing => existing.id !== log.id)]),
          (updatedTasks) => {
            const updatesById = new Map(updatedTasks.map(task => [task.id, task]));
            setTasks(previous => previous.map(task => updatesById.get(task.id) ?? task));
          }
        );
        const refreshedNotifications = await notificationAPI.getMine();
        setNotifications(refreshedNotifications);

        setLastRun(Date.now());
      } catch (err) {
        console.error("Monitoring cycle error:", err);
      } finally {
        setIsMonitoring(false);
        isMonitoringRef.current = false;
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [tasks, currentUser, users]);

  // Filter tasks based on role
  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];
    switch (currentUser.role) {
      case UserRole.ADMIN:
        return tasks;
      case UserRole.MANAGER:
      case UserRole.TEAM_LEAD:
        // The backend scopes the list; include cross-team work for owned/member projects.
        const ledOrJoinedProjects = projects
          .filter(p => p.leadId === currentUser.id || p.memberIds.includes(currentUser.id))
          .map(p => p.id);
        return tasks.filter(t =>
          t.teamId === currentUser.teamId ||
          (t.projectId && ledOrJoinedProjects.includes(t.projectId))
        );
      case UserRole.ASSIGNEE:
        // Show tasks assigned to user OR belonging to projects user is a member of
        const userProjectIds = projects
          .filter(p => p.memberIds.includes(currentUser.id))
          .map(p => p.id);

        return tasks.filter(t =>
          t.assigneeId === currentUser.id ||
          (t.projectId && userProjectIds.includes(t.projectId))
        );
      default:
        return [];
    }
  }, [tasks, currentUser, projects]);

  const selectedTask = useMemo(() =>
    tasks.find(t => t.id === selectedTaskId),
    [tasks, selectedTaskId]
  );

  const selectedLogs = useMemo(() =>
    logs.filter(l => l.taskId === selectedTaskId).sort((a, b) => b.timestamp - a.timestamp),
    [logs, selectedTaskId]
  );

  const escalationPath = selectedLogs[0]?.escalationPath ?? [];

  if (!currentUser) {
    if (loading) {
      return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Validating session...</div>;
    }
    return <Auth onLogin={handleLogin} />;
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED: return 'bg-green-100 text-green-700';
      case TaskStatus.AT_RISK: return 'bg-yellow-100 text-yellow-700';
      case TaskStatus.OVERDUE: return 'bg-red-100 text-red-700';
      case TaskStatus.ESCALATED: return 'bg-purple-100 text-purple-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  const getActionIcon = (action: ActionType) => {
    switch (action) {
      case ActionType.REMIND: return '🔔';
      case ActionType.RISK_ALERT: return '⚠️';
      case ActionType.ESCALATE: return '⬆️';
      case ActionType.CRITICAL_ESCALATE: return '🚨';
      default: return '✅';
    }
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);

    // Get selected skills from form
    const skillsSelect = e.currentTarget.querySelector('select[name="requiredSkills"]') as HTMLSelectElement;
    const selectedSkills = skillsSelect ? Array.from(skillsSelect.selectedOptions).map(opt => opt.value) : [];

    // Get assignee from dropdown (optional - backend will auto-assign if not provided)
    const manualAssigneeId = formData.get('assigneeId') as string;

    try {
      // Prepare task data
      const taskData = {
        title: formData.get('title') as string,
        description: (formData.get('description') as string) || 'Task created via workflow delegation',
        priority: formData.get('priority') as string,
        deadline: Date.now() + parseInt(formData.get('deadline') as string) * 60 * 1000,
        teamId: currentUser.teamId,
        deptId: currentUser.deptId,
        orgId: 'ORG-001',
        projectId: formData.get('projectId') as string || undefined,
        requiredSkills: selectedSkills.length > 0 ? selectedSkills : undefined,
        assigneeId: manualAssigneeId || undefined // Let backend auto-assign if empty
      };

      console.log('📤 Creating task with data:', taskData);

      // Create task via MongoDB API (backend handles auto-assignment)
      const newTask = await taskAPI.create(taskData);

      console.log('✅ Task created:', newTask);

      // Add to local state
      setTasks([newTask, ...tasks]);
      // Reset form safely
      const form = e.currentTarget;
      if (form) form.reset();
    } catch (error: any) {
      console.error('Failed to create task:', error);
      alert(`Failed to create task: ${error.message}`);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      console.log(`📝 Completing task ${taskId} automatically...`);

      // Complete task via API (no args - let backend auto-calculate)
      const completedTask = await taskAPI.complete(taskId);

      console.log('✅ Task completed:', completedTask);

      // Update local state
      setTasks(tasks.map(t => t.id === taskId ? completedTask : t));

      alert(`Task completed automatically!\n\nUse: Time spent has been calculated based on assignment duration.`);
    } catch (error: any) {
      console.error('Failed to complete task:', error);
      alert(`Failed to complete task: ${error.message}`);
    }
  };

  const handleUpdateSkills = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setUsers(previous => previous.map(user =>
      user.id === updatedUser.id ? updatedUser : user
    ));
  };

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  const userDept = DEPARTMENTS.find(d => d.id === currentUser.deptId);
  const canManage = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_LEAD;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center bg-fixed text-slate-100">
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-0"></div>

      {/* Sidebar Navigation */}
      <aside className="relative z-10 w-full lg:w-72 glass-panel border-r border-slate-700/50 p-6 shrink-0 flex flex-col h-screen sticky top-0">
        <div className="flex items-center gap-4 mb-10 pl-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">AEIP</h1>
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Intelligence Layer</span>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/20 text-indigo-300 rounded-xl font-medium cursor-pointer border border-indigo-500/30 shadow-sm transition-all hover:scale-[1.02]">
            <Icons.Dashboard />
            <span>Overview</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl cursor-pointer transition-all hover:translate-x-1">
            <Icons.Task />
            <span>{currentUser.role === UserRole.ASSIGNEE ? 'My Workflows' : 'Team Execution'}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl cursor-pointer transition-all hover:translate-x-1">
            <Icons.Alert />
            <span>Risk Center</span>
          </div>

          {/* User Skills Section */}
          <div className="mt-8 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Skills</p>
              <button
                onClick={() => setShowSkillManager(true)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase hover:underline transition-colors"
              >
                Manage
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {currentUser.skills && currentUser.skills.length > 0 ? (
                currentUser.skills.slice(0, 6).map(skill => (
                  <span key={skill} className="text-[10px] px-2 py-1 bg-indigo-500/10 text-indigo-300 rounded-md font-medium border border-indigo-500/20">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500 italic">No skills added</span>
              )}
            </div>
            {currentUser.skills && currentUser.skills.length > 6 && (
              <p className="text-[10px] text-slate-500 mt-2 text-right">+{currentUser.skills.length - 6} more</p>
            )}
          </div>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800/50">
          <div className="flex items-center gap-3 mb-6 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold shadow-lg group-hover:scale-105 transition-transform">{currentUser.name.charAt(0)}</div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-slate-200">{currentUser.name}</p>
              <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">{currentUser.role}</p>
            </div>
          </div>

          <div className="text-[10px] uppercase text-slate-500 mb-2 font-bold tracking-widest flex items-center justify-between">
            <span>System Status</span>
            <span className="text-emerald-500">ONLINE</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] mb-4 bg-black/20 p-2 rounded-lg">
            <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.8)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'}`}></div>
            <span className="text-slate-300 font-medium">{isMonitoring ? 'Agentic Monitor Active' : 'System Operational'}</span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-2.5 border border-red-500/20 bg-red-500/5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all hover:shadow-lg hover:shadow-red-900/10"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 p-4 lg:p-8 overflow-y-auto h-screen scroll-smooth">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10 pb-6 border-b border-slate-700/30">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{userDept?.name || 'Global Administration'}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{TEAMS.find(t => t.id === currentUser.teamId)?.name || 'General Org'}</span>
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight mb-1">Operational Console</h2>
            <p className="text-slate-400 text-sm">Welcome back, <span className="text-slate-200 font-medium">{currentUser.name}</span>. Monitoring <span className="text-white font-bold">{filteredTasks.length}</span> active threads.</p>
          </div>
          <div className="flex gap-2">
            {/* View Mode Toggle */}
            <div className="glass-panel p-1 rounded-xl flex items-center">
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'LIST' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <Icons.Task />
                  <span>LIST</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('GANTT')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'GANTT' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <span>📊</span>
                  <span>GANTT</span>
                </div>
              </button>
            </div>

            <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Performance</p>
                <p className="text-sm font-bold text-white">{(currentUser.reliabilityScore * 10).toFixed(1)}<span className="text-slate-500 text-[10px]">/10</span></p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-emerald-900/20">
                {currentUser.reliabilityScore >= 0.9 ? 'S+' : currentUser.reliabilityScore >= 0.7 ? 'A' : 'B'}
              </div>
            </div>
          </div>
        </header>

        <ProjectManager
          currentUser={currentUser}
          projects={projects}
          users={users}
          onProjectsChange={(updatedProjects) => setProjects(updatedProjects)}
        />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Column: Actions & Tasks */}
          <div className="xl:col-span-2 space-y-8 min-w-0">

            {/* Context-Aware Action Panel */}
            {canManage ? (
              <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.75l-2.5 1zm0 2.25l-5-2.5-5 2.5 10 5 10-5-5-2.5-5 2.5z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-3 uppercase tracking-wider relative z-10">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.8)] animate-pulse"></div>
                  Delegate New Workflow
                </h3>
                <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Workflow Target</label>
                    <input name="title" required className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium text-white placeholder-slate-600 transition-all hover:bg-slate-900/70" placeholder="e.g. Critical Bug Fix: Payment Gateway" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Urgency</label>
                    <select name="priority" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium text-white transition-all hover:bg-slate-900/70">
                      <option value="LOW">Low Latency</option>
                      <option value="MEDIUM">Standard</option>
                      <option value="HIGH">Critical Path</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">TTL (Minutes)</label>
                    <input name="deadline" type="number" defaultValue="10" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium text-white transition-all hover:bg-slate-900/70" />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                      Assign to Project (Optional)
                    </label>
                    <select
                      name="projectId"
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium text-white transition-all hover:bg-slate-900/70"
                    >
                      <option value="">No Project (General Task)</option>
                      {projects.filter(p =>
                        currentUser.role === UserRole.ADMIN ||
                        p.leadId === currentUser.id ||
                        p.memberIds.includes(currentUser.id)
                      ).map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name} {project.leadId === currentUser.id ? '(You lead)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-400 mt-1">
                      {projects.length === 0
                        ? '⚠️ No projects found. Create a project in "Project Management" section above first.'
                        : `Link this task to a specific project for better organization (${projects.filter(p => currentUser.role === UserRole.ADMIN || p.leadId === currentUser.id || p.memberIds.includes(currentUser.id)).length} available)`
                      }
                    </p>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                      Required Skills (Auto-assigns to best match)
                    </label>
                    <select
                      name="requiredSkills"
                      multiple
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium max-h-24 text-white transition-all hover:bg-slate-900/70"
                    >
                      {ALL_SKILLS.slice(0, 15).map(skill => (
                        <option key={skill} value={skill}>{skill}</option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-400 mt-1">
                      💡 Selecting skills will auto-assign to employee with best skill+performance match
                    </p>
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <select name="assigneeId" className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm font-medium text-white transition-all hover:bg-slate-900/70">
                      <option value="">🤖 Auto-Assign (Skill + Performance Match)</option>
                      {users.filter(u =>
                        (u.deptId === currentUser.deptId || currentUser.role === UserRole.ADMIN) &&
                        u.role !== UserRole.ADMIN
                      ).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role}) - {(u.reliabilityScore * 10).toFixed(1)}/10</option>
                      ))}
                    </select>
                    <button type="submit" className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-2.5 rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95">Deploy</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Load</p>
                  <p className="text-3xl font-black text-white mt-1">{filteredTasks.length}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <p className="text-[10px] text-emerald-400 font-medium">Within optimal capacity</p>
                  </div>
                </div>
                <div className="glass-panel p-5 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Reminders</p>
                  <p className="text-3xl font-black text-white mt-1">{filteredTasks.filter(t => t.lastAction === ActionType.REMIND).length}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    <p className="text-[10px] text-indigo-400 font-medium">No critical alerts</p>
                  </div>
                </div>
                <div className="glass-panel p-5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Estimated Recovery</p>
                  <p className="text-3xl font-black text-indigo-300 mt-1">94%</p>
                  <p className="text-[10px] text-indigo-400/70 font-medium mt-2">Based on historical RAG patterns</p>
                </div>
              </div>
            )
            }

            {/* Main Task Feed */}
            {
              viewMode === 'LIST' ? (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/30">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                      <Icons.Task />
                      Operational Monitor
                    </h3>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold rounded flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                        REAL-TIME
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                          <th className="px-6 py-4">Context</th>
                          <th className="px-6 py-4">Assignee / Project</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4">TTL</th>
                          <th className="px-6 py-4">Execution Risk</th>
                          <th className="px-6 py-4">Agentic Response</th>
                          <th className="px-6 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {filteredTasks.map(task => (
                          <tr
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className={`hover:bg-indigo-500/5 cursor-pointer transition-colors ${selectedTaskId === task.id ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''}`}
                          >
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-800">{task.title}</div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${task.priority === 'HIGH' ? 'text-red-600 border-red-100 bg-red-50' : 'text-slate-500 border-slate-200'}`}>
                                  {task.priority}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                                  👤 {users.find(u => u.id === task.assigneeId)?.name || 'Unassigned'}
                                </span>
                                {task.requiredSkills && task.requiredSkills.length > 0 && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    {task.requiredSkills.length} skill{task.requiredSkills.length > 1 ? 's' : ''} req.
                                  </span>
                                )}
                                {task.projectId && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                                    📁 {projects.find(p => p.id === task.projectId)?.name || 'Project'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-700">
                                    👤 {users.find(u => u.id === task.assigneeId)?.name || 'Unassigned'}
                                  </span>
                                </div>
                                {task.projectId && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">
                                      📁 {projects.find(p => p.id === task.projectId)?.name || 'Project'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${getStatusColor(task.status)}`}>
                                {task.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">
                              {task.deadline < Date.now() ? (
                                <span className="text-red-500 font-bold">LATE</span>
                              ) : (
                                `${Math.ceil((task.deadline - Date.now()) / (1000 * 60))}m`
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden w-20">
                                  <div
                                    className={`h-full transition-all duration-500 ${task.riskScore > 75 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : task.riskScore > 40 ? 'bg-amber-400' : 'bg-green-400'}`}
                                    style={{ width: `${task.riskScore}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold ${task.riskScore > 75 ? 'text-red-500' : 'text-slate-400'}`}>
                                  {task.riskScore}%
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{getActionIcon(task.lastAction)}</span>
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
                                  {task.lastAction === ActionType.NONE ? 'Scanning' : task.lastAction.replace('_', ' ')}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {task.status !== 'COMPLETED' && task.assigneeId === currentUser.id && (
                                <button
                                  onClick={() => handleCompleteTask(task.id)}
                                  className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold rounded-lg transition-colors"
                                >
                                  ✓ Complete
                                </button>
                              )}
                              {task.status === 'COMPLETED' && (
                                <span className="text-[10px] text-green-600 font-bold">
                                  ✓ Done
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredTasks.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                              No active monitoring threads found in your current scope.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <GanttChart tasks={filteredTasks} users={users} />
              )
            }
          </div>
        </div>

        {/* Right Column: AI Trace Panel */}
        <div className="space-y-6">
          <section className="bg-white p-4 rounded-xl shadow border border-slate-200 text-slate-800">
            <button
              type="button"
              onClick={() => setShowNotifications(open => !open)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-700">
                Notifications
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                {notifications.filter(item => item.status === 'DELIVERED').length} pending
              </span>
            </button>
            {notificationError && (
              <p role="alert" className="mt-3 text-[11px] text-red-600">{notificationError}</p>
            )}
            {showNotifications && (
              <div className="mt-4 space-y-3">
                {notifications.map(notification => (
                  <article key={notification.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-800">{notification.taskTitle}</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {notification.fromLevel} → {notification.toLevel} · Risk {notification.riskScore}/100
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">{notification.reason}</p>
                    <p className="mt-2 text-[9px] font-bold uppercase text-indigo-600">
                      {notification.action.replace('_', ' ')} · {notification.status}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {notification.status === 'DELIVERED' && (
                        <button
                          onClick={() => void handleNotificationTransition(notification, 'acknowledge')}
                          className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Acknowledge
                        </button>
                      )}
                      {notification.status === 'ACKNOWLEDGED' && (
                        <button
                          onClick={() => void handleNotificationTransition(notification, 'resolve')}
                          className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {notifications.length === 0 && (
                  <p className="text-[11px] text-slate-400">No notifications for your account.</p>
                )}
              </div>
            )}
          </section>

          <div className="bg-white p-4 rounded-xl shadow border border-slate-200 sticky top-8 text-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-indigo-600">
                <div className="p-1.5 bg-indigo-50 rounded-lg">
                  <Icons.Brain />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-700">Decision Trace</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[9px] font-bold text-slate-500">ACTIVE</span>
              </div>
            </div>

            {!selectedTaskId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-2 border border-dashed border-slate-200">
                  <Icons.Task />
                </div>
                <p className="text-xs font-bold text-slate-600">Select an execution thread</p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                {selectedLogs[0] ? <>
                  <section className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Persisted decision</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-700">
                      {selectedLogs[0].id}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {new Date(selectedLogs[0].timestamp).toLocaleString()}
                    </p>
                  </section>
                <section>
                  <label className="text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] mb-3 block">
                    {selectedLogs[0]?.retrievalSource === 'LOCAL_FALLBACK'
                      ? 'Local heuristic fallback (not RAG)'
                      : selectedLogs[0]?.retrievalSource === 'FAISS'
                        ? 'RAG Memory Recall (FAISS)'
                        : 'RAG Memory Recall'}
                  </label>
                  <div className="space-y-2">
                    {selectedLogs[0]?.retrievedMemories.length ? selectedLogs[0].retrievedMemories.map((m, idx) => (
                      <div key={m.id || idx} className="p-3 text-[11px] bg-indigo-50/40 text-indigo-700 border-l-4 border-indigo-400 rounded-r-xl font-medium leading-relaxed">
                        <span className="opacity-40 mr-1 text-xs">#</span> {m.text}
                        {typeof m.score === 'number' && (
                          <span className="mt-1 block text-[9px] font-bold text-indigo-500">
                            Similarity: {m.score.toFixed(3)}
                          </span>
                        )}
                      </div>
                    )) : <div className="text-[11px] text-slate-400 italic">
                      {selectedLogs[0]?.retrievalSource === 'FAISS'
                        ? 'FAISS returned no memory above the relevance threshold.'
                        : selectedLogs[0]?.retrievalSource === 'LOCAL_FALLBACK'
                          ? 'The local fallback returned no memory.'
                          : 'No memory retrieval was recorded for this decision.'}
                    </div>}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] mb-3 block">Deterministic risk decision</label>
                  <div className="p-5 bg-slate-900 text-indigo-100 rounded-2xl text-[12px] leading-relaxed font-mono">
                    <p>Risk score: {selectedLogs[0].riskScore}/100</p>
                    <p>Action: {selectedLogs[0].action}</p>
                    <p className="mt-2 text-slate-400">Calculated from deadline, task status, priority, and assignee reliability.</p>
                  </div>
                </section>

                <section>
                  <label className="text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] mb-3 block">
                    {selectedLogs[0]?.explanationSource === 'GEMINI'
                      ? 'Gemini explanation'
                      : 'Local deterministic fallback'}
                  </label>
                  <div className="p-4 bg-indigo-50/40 text-indigo-700 rounded-xl text-[11px] leading-relaxed">
                    {selectedLogs[0]?.explanation || 'No explanation was generated for the current decision.'}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] mb-3 block">Escalation Path</label>
                  <div className="relative pl-8 pt-2">
                    <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-indigo-100"></div>
                    {escalationPath.length ? escalationPath.map((step, idx, arr) => (
                      <div key={idx} className="relative mb-6 last:mb-0 flex items-center gap-4 group">
                        <div className={`absolute -left-[23px] w-4 h-4 rounded-full border-4 border-white z-10 shadow-sm transition-all duration-300 ${idx === 0 ? 'bg-green-500' : idx < arr.length - 1 ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
                        <div>
                          <span className={`text-[11px] font-bold block ${idx < arr.length - 1 ? 'text-slate-800' : 'text-slate-400'}`}>
                            {step}
                          </span>
                          <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">
                            {idx === 0 ? 'ACTIVE EXECUTOR' : idx === arr.length - 1 ? 'PENDING TARGET' : 'INTERMEDIARY'}
                          </span>
                        </div>
                      </div>
                    )) : <p className="text-[11px] text-slate-400">No escalation is currently required.</p>}
                  </div>
                  {selectedLogs[0]?.escalation && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600">
                      <p>Escalation: {selectedLogs[0].escalation.fromLevel} → {selectedLogs[0].escalation.toLevel}</p>
                      <p>Status: {selectedLogs[0].escalation.status}</p>
                      <p>Delivery: {selectedLogs[0].escalation.deliveryStatus}</p>
                      {selectedLogs[0].notification && (
                        <p>Recipient: {selectedLogs[0].notification.recipientUserId}</p>
                      )}
                    </div>
                  )}
                </section>
                {selectedLogs[0]?.execution && (
                  <section>
                    <label className="text-[10px] uppercase font-black text-slate-300 tracking-[0.2em] mb-3 block">
                      Execution Memory
                    </label>
                    <div className="rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600">
                      <p>Status: {selectedLogs[0].execution.status}</p>
                      {selectedLogs[0].execution.memoryId && <p>Memory ID: {selectedLogs[0].execution.memoryId}</p>}
                    </div>
                  </section>
                )}
                </> : (
                  <p role="status" className="rounded-lg bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-500">
                    No persisted decision trace is available for this task yet. The panel will show recorded retrieval, reasoning, escalation, and explanation data after the agent makes a decision.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 text-[11px] text-amber-700 flex gap-4">
            <div className="shrink-0 text-lg">🛡️</div>
            <p className="leading-normal">
              <strong>Data Privacy:</strong> Risk scoring is deterministic. When enabled, Gemini receives the task title, status, priority, role, risk score, and retrieved memories to generate an explanation.
            </p>
          </div>
        </div>
      </main>

      {/* Skill Manager Modal */}
      {
        showSkillManager && (
          <SkillManager
            currentUser={currentUser}
            onUpdateSkills={handleUpdateSkills}
            onClose={() => setShowSkillManager(false)}
          />
        )
      }
    </div>
  );
};

export default App;
