import React, { useMemo, useState, useEffect } from 'react';
import { Task, User } from './types';

interface GanttChartProps {
    tasks: Task[];
    users: User[];
    onTaskUpdate?: (task: Task) => void;
}

const CELL_WIDTH = 40; // Pixels per hour
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 50;

export const GanttChart: React.FC<GanttChartProps> = ({ tasks, users }) => {
    // Live Time state for real-time Gantt tracking
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 60000); // update every minute
        return () => clearInterval(interval);
    }, []);

    // 1. Calculate Time Range & Auto-Schedule
    const { visualTasks, minTime, maxTime, totalHours } = useMemo(() => {
        if (tasks.length === 0) return { visualTasks: [], minTime: Date.now(), maxTime: Date.now() + 86400000, totalHours: 24 };

        const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));
        const visualStartDates = new Map<string, number>();

        // Recursive function to calculate start time based on dependencies
        const getVisualStart = (taskId: string, visited: Set<string> = new Set()): number => {
            if (visited.has(taskId)) return Date.now(); // Cycle detection fallback
            if (visualStartDates.has(taskId)) return visualStartDates.get(taskId)!;

            visited.add(taskId);
            const task = taskMap.get(taskId);
            if (!task) return Date.now();

            // Default to task's own start or creation time (ensure number)
            let startTime = typeof task.startDate === 'number' ? task.startDate : (task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now());

            // If dependencies exist, start AFTER the max end time of dependencies
            if (task.dependencies && task.dependencies.length > 0) {
                let maxDependencyEnd = 0;
                task.dependencies.forEach(depId => {
                    const depTask = taskMap.get(depId);
                    if (depTask) {
                        const depStart = getVisualStart(depId, new Set(visited));
                        const depDuration = (depTask.estimatedDuration || 60) * 60000;
                        maxDependencyEnd = Math.max(maxDependencyEnd, depStart + depDuration);
                    }
                });

                if (maxDependencyEnd > 0) {
                    // Add a small buffer (e.g., 30 mins) between tasks for visual clarity
                    startTime = Math.max(startTime, maxDependencyEnd + 30 * 60000);
                }
            }

            visualStartDates.set(taskId, startTime);
            return startTime;
        };

        // Calculate all start times
        const processedTasks = tasks.map(t => {
            const vStart = getVisualStart(t.id);
            return { ...t, startDate: vStart };
        });

        const min = Math.min(...processedTasks.map(t => t.startDate));
        const max = Math.max(...processedTasks.map(t =>
            Math.max(t.deadline, t.startDate + (t.estimatedDuration || 60) * 60000)
        ));

        console.log('📊 Gantt Calc:', {
            tasksCount: tasks.length,
            minTime: new Date(min).toISOString(),
            maxTime: new Date(max).toISOString(),
            rawMin: min,
            rawMax: max
        });

        // Add buffer
        const start = min - 3600000 * 2; // -2 hours
        const end = max + 3600000 * 4; // +4 hours
        const hours = Math.ceil((end - start) / 3600000);

        return { visualTasks: processedTasks, minTime: start, maxTime: end, totalHours: hours };
    }, [tasks]);

    // 2. Generate Time Helpers
    const timeToX = (time: number) => {
        return ((time - minTime) / 3600000) * CELL_WIDTH;
    };

    const hoursArray = Array.from({ length: totalHours }, (_, i) => {
        const time = minTime + i * 3600000;
        return new Date(time);
    });

    const formatTime = (time: number) => {
        const d = new Date(time);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    // 3. Analytics Summary (Real-Time)
    const analytics = useMemo(() => {
        const total = visualTasks.length;
        const completed = visualTasks.filter(t => t.status === 'COMPLETED').length;
        const overdue = visualTasks.filter(t => t.status === 'OVERDUE' || t.deadline < now && t.status !== 'COMPLETED').length;
        const critical = visualTasks.filter(t => t.priority === 'HIGH' && t.status !== 'COMPLETED').length;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, overdue, critical, progress };
    }, [visualTasks, now]);

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Real-Time Analytics Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Overall Progress</p>
                        <p className="text-2xl font-black text-indigo-700">{analytics.progress}%</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 text-lg">📈</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Completed / Total</p>
                        <p className="text-2xl font-black text-slate-800">{analytics.completed} <span className="text-sm font-medium text-slate-400">/ {analytics.total}</span></p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 text-lg">✅</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Late Tasks</p>
                        <p className="text-2xl font-black text-red-600">{analytics.overdue}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 text-lg">⚠️</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Critical Path</p>
                        <p className="text-2xl font-black text-orange-500">{analytics.critical}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-500 text-lg">🔥</div>
                </div>
            </div>

            {/* Gantt Area */}
            <div className="glass-panel bg-white rounded-2xl overflow-hidden flex flex-col flex-1 border border-slate-200 shadow-sm">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-lg animate-pulse">🔴</span> Live Gantt Chart
                    </h3>
                    <div className="flex gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div> <span className="text-indigo-700">Planned</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div> <span className="text-emerald-700">Completed</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div> <span className="text-red-700">Delayed</span></div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative custom-scrollbar bg-slate-50">
                    <div style={{ minWidth: `${totalHours * CELL_WIDTH + 200}px` }}>
                        {/* Header */}
                        <div className="flex sticky top-0 bg-white/95 backdrop-blur z-20 border-b border-slate-200 shadow-sm" style={{ height: HEADER_HEIGHT }}>
                            <div className="w-56 shrink-0 border-r border-slate-200 p-3 font-bold text-[10px] uppercase tracking-wider text-slate-500 flex items-center bg-white/95 backdrop-blur sticky left-0 z-30 shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                                Task Flow
                            </div>
                            {hoursArray.map((date, i) => (
                                <div key={i} className="border-r border-slate-800/50 text-[9px] text-slate-500 p-1 flex items-center justify-center font-mono" style={{ width: CELL_WIDTH }}>
                                    {date.getHours()}:00
                                </div>
                            ))}
                        </div>

                        {/* Rows */}
                        <div className="relative">
                            {/* Grid Lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                                <div className="w-56 shrink-0 border-r border-slate-200 bg-transparent z-10"></div>
                                {hoursArray.map((_, i) => (
                                    <div key={i} className="border-r border-slate-200 h-full" style={{ width: CELL_WIDTH }}></div>
                                ))}
                            </div>

                            {/* Real-time Indicator (NOW) */}
                            {now >= minTime && now <= maxTime && (
                                <div className="absolute top-0 bottom-0 w-[2px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] z-20 pointer-events-none"
                                    style={{ left: `${timeToX(now) + 224}px` }}
                                    title="Current Time"
                                >
                                    <div className="absolute -top-1 -ml-[3px] w-2 h-2 rounded-full bg-blue-600"></div>
                                    <div className="absolute top-2 -ml-6 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">NOW</div>
                                </div>
                            )}

                            {visualTasks.map(task => {
                                const start = task.startDate || Date.now();
                                const duration = task.estimatedDuration || 60; // minutes
                                const width = (duration / 60) * CELL_WIDTH;
                                const left = timeToX(start) + 224; // 224 is w-56
                                const assignee = users.find(u => u.id === task.assigneeId);

                                // Check if critical (simplified logic for UI)
                                const isCritical = task.priority === 'HIGH' && task.deadline - (start + duration * 60000) < 3600000 * 4;
                                const isCompleted = task.status === 'COMPLETED';

                                return (
                                    <div key={task.id} className="flex border-b border-slate-800/30 hover:bg-white/5 relative group transition-colors" style={{ height: ROW_HEIGHT }}>
                                        {/* Label */}
                                        <div className="w-56 shrink-0 border-r border-slate-200 p-3 flex flex-col justify-center sticky left-0 bg-white z-30 hover:bg-slate-50 transition-colors shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                                            <p className="text-sm font-bold text-slate-800 truncate transition-colors" title={task.title}>{task.title}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 border border-indigo-200">
                                                        {assignee?.name.charAt(0) || '?'}
                                                    </div>
                                                    <p className="text-[11px] font-semibold text-slate-600 truncate max-w-[80px]" title={assignee?.name}>{assignee?.name || 'Unassigned'}</p>
                                                </div>
                                                {task.status === 'OVERDUE' && <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1 rounded">LATE</span>}
                                                {task.status === 'CREATED' && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1 rounded">PENDING</span>}
                                            </div>
                                        </div>

                                        {/* Bar */}
                                        <div className={`absolute top-3 h-6 rounded px-2 shadow-lg border border-white/20 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl hover:z-20 z-0 text-[10px] flex items-center font-bold text-white overflow-hidden whitespace-nowrap ${isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                                            task.status === 'OVERDUE' ? 'bg-gradient-to-r from-red-500 to-red-700 shadow-[0_0_10px_rgba(239,68,68,0.5)] border-red-400' :
                                                isCritical ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' :
                                                    'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                                            }`}
                                            style={{
                                                left: `${left}px`,
                                                width: `${Math.max(width, 2)}px`,
                                            }}
                                            title={`${task.title} (${duration}m)`}
                                        >
                                            {width > 40 && (
                                                <div className="flex justify-between items-center w-full px-1 drop-shadow-md">
                                                    {width > 100 && <span className="opacity-80 font-mono tracking-tighter">{formatTime(start)}</span>}
                                                    <span className="truncate mx-2 flex-1 text-center">{task.title}</span>
                                                    {width > 100 && <span className="opacity-80 font-mono tracking-tighter">{formatTime(start + (duration * 60000))}</span>}
                                                </div>
                                            )}
                                        </div>

                                        {/* Deadline Indicator */}
                                        <div className="absolute top-0 bottom-0 w-px bg-red-500/50 border-l border-red-500/50 border-dashed"
                                            style={{ left: `${timeToX(task.deadline) + 224}px` }}
                                            title="Deadline"
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 absolute -top-0.5 -left-[3px]"></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* SVG Overlay for Dependencies */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 opacity-40">
                            {visualTasks.map((task, rowIndex) => (
                                task.dependencies?.map(depId => {
                                    const depTask = visualTasks.find(t => t.id === depId);
                                    const depIndex = visualTasks.findIndex(t => t.id === depId);
                                    if (!depTask || depIndex === -1) return null;

                                    // Simple S-curve connection
                                    const startX = timeToX((depTask.startDate || 0) + (depTask.estimatedDuration || 0) * 60000) + 224;
                                    const startY = depIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                                    const endX = timeToX(task.startDate || 0) + 224;
                                    const endY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                                    return (
                                        <path
                                            key={`${depId}-${task.id}`}
                                            d={`M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`}
                                            fill="none"
                                            stroke="#94a3b8"
                                            strokeWidth="1.5"
                                            markerEnd="url(#arrowhead)"
                                            className="drop-shadow"
                                        />
                                    );
                                })
                            ))}
                            <defs>
                                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                    <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                                </marker>
                            </defs>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};
