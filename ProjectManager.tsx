import React, { useState, useEffect } from 'react';
import { User, UserRole, Project } from './types';
import { USERS, MOCK_ORG_ID } from './mockData';
import { userAPI, projectAPI } from './api/client';

interface ProjectManagerProps {
    currentUser: User;
    onProjectsChange?: (projects: Project[]) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ currentUser, onProjectsChange }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', description: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // Load users from MongoDB
                const loadedUsers = await userAPI.getAll();
                setUsers(loadedUsers);

                // Load projects from MongoDB
                const loadedProjects = await projectAPI.getAll(currentUser.id);
                setProjects(loadedProjects);
                console.log('📁 ProjectManager loaded:', loadedProjects.length, 'projects');
            } catch (error) {
                console.error('Failed to load data:', error);
                // Fallback to mock data
                setUsers(USERS);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const refreshProjects = async () => {
        try {
            const loadedProjects = await projectAPI.getAll(currentUser.id);
            setProjects(loadedProjects);
            if (onProjectsChange) {
                onProjectsChange(loadedProjects);
            }
        } catch (error) {
            console.error('Failed to refresh projects:', error);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const leadId = currentUser.role === UserRole.TEAM_LEAD ? currentUser.id : undefined;
            const newProj = await projectAPI.create({
                name: newProject.name,
                description: newProject.description,
                orgId: MOCK_ORG_ID
            }, leadId);

            console.log('✅ Project created:', newProj);
            await refreshProjects();
            setShowCreateModal(false);
            setNewProject({ name: '', description: '' });
        } catch (error: any) {
            console.error('Failed to create project:', error);
            alert(`Failed to create project: ${error.message}`);
        }
    };

    const handleAssignLead = async (projectId: string, leadId: string) => {
        try {
            await projectAPI.update(projectId, { leadId });
            await refreshProjects();
        } catch (error: any) {
            console.error('Failed to assign lead:', error);
            alert(`Failed to assign lead: ${error.message}`);
        }
    };

    const handleAddMember = async (projectId: string, memberId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (project && !project.memberIds.includes(memberId)) {
            try {
                await projectAPI.addMember(projectId, memberId);
                await refreshProjects();
            } catch (error: any) {
                console.error('Failed to add member:', error);
                alert(`Failed to add member: ${error.message}`);
            }
        }
    };

    // Filter projects based on role
    const visibleProjects = projects.filter(p => {
        if (currentUser.role === UserRole.ADMIN) return true;
        if (currentUser.role === UserRole.TEAM_LEAD) return p.leadId === currentUser.id;
        return p.memberIds.includes(currentUser.id);
    });

    const availableLeads = users.filter(u => u.role === UserRole.TEAM_LEAD || u.role === UserRole.MANAGER);
    const availableEmployees = users.filter(u => u.role === UserRole.ASSIGNEE);

    return (
        <div className="glass-panel p-6 rounded-2xl mb-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                            📁
                        </span>
                        Project Management
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 ml-10">
                        {currentUser.role === UserRole.ADMIN ? 'Global Organization Projects' :
                            currentUser.role === UserRole.TEAM_LEAD ? 'My Assigned Leadership' : 'Active Project Memberships'}
                    </p>
                </div>
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_LEAD) && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 active:scale-95 flex items-center gap-2"
                    >
                        <span>+</span> New Project
                    </button>
                )}
            </div>

            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-panel p-6 rounded-2xl w-full max-w-md shadow-2xl border border-white/10 relative">
                        <h3 className="font-bold text-white mb-4 text-lg">Create New Project</h3>
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Project Name</label>
                                <input
                                    placeholder="e.g. Q3 Financial Audit AI"
                                    required
                                    className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm text-white placeholder-slate-500 transition-all hover:bg-black/30"
                                    value={newProject.name}
                                    onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Description</label>
                                <textarea
                                    placeholder="Describe the scope and objectives..."
                                    className="w-full px-4 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-sm text-white placeholder-slate-500 transition-all hover:bg-black/30 min-h-[100px]"
                                    value={newProject.description}
                                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/30">Create Project</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleProjects.length === 0 ? (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-700/50 rounded-2xl bg-slate-900/20">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center text-slate-600 mx-auto mb-4">
                            📁
                        </div>
                        <p className="text-slate-400 text-sm font-medium">No active projects found.</p>
                        <p className="text-slate-500 text-xs mt-1">{currentUser.role === UserRole.ADMIN ? 'Create one to get started.' : 'Contact your manager for assignment.'}</p>
                    </div>
                ) : (
                    visibleProjects.map(project => (
                        <div key={project.id} className="group border border-slate-700/50 rounded-xl p-5 hover:border-indigo-500/30 transition-all bg-slate-800/20 hover:bg-slate-800/40 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-10 transition-opacity">
                                <svg className="w-24 h-24 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-white text-lg tracking-tight leading-tight">{project.name}</h3>
                                    <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase ${project.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        project.status === 'COMPLETED' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                            'bg-slate-700/50 text-slate-400 border-slate-600'
                                        }`}>
                                        {project.status}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mb-6 line-clamp-2 h-8 leading-relaxed">{project.description}</p>

                                <div className="space-y-4">
                                    {/* Team Lead Section */}
                                    <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                        <label className="text-[9px] uppercase font-bold text-slate-500 block mb-2 tracking-wider">Team Lead</label>
                                        {currentUser.role === UserRole.ADMIN ? (
                                            <select
                                                className="w-full text-xs p-1.5 border border-slate-700 rounded bg-slate-900 text-slate-300 outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
                                                value={project.leadId || ''}
                                                onChange={(e) => handleAssignLead(project.id, e.target.value)}
                                            >
                                                <option value="">-- Assign Lead --</option>
                                                {availableLeads.map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                                                    {users.find(u => u.id === project.leadId)?.name.charAt(0) || '?'}
                                                </div>
                                                <span className="text-xs font-bold text-slate-300">
                                                    {users.find(u => u.id === project.leadId)?.name || 'Unassigned'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Members Section */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Members</label>
                                            <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 rounded">{project.memberIds.length}</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2 overflow-hidden">
                                                {project.memberIds.slice(0, 5).map((mid, idx) => {
                                                    const m = users.find(u => u.id === mid);
                                                    return m ? (
                                                        <div key={mid} title={m.name} className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-400 hover:scale-110 hover:z-10 transition-transform cursor-help">
                                                            {m.name.charAt(0)}
                                                        </div>
                                                    ) : null;
                                                })}
                                                {project.memberIds.length > 5 && (
                                                    <div className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                                        +{project.memberIds.length - 5}
                                                    </div>
                                                )}
                                            </div>

                                            {currentUser.role === UserRole.TEAM_LEAD && project.leadId === currentUser.id && (
                                                <div className="relative flex-1">
                                                    <select
                                                        className="w-full text-[10px] p-1.5 pl-2 border border-dashed border-slate-700 hover:border-indigo-500/50 rounded-full bg-transparent text-slate-400 hover:text-indigo-400 outline-none appearance-none cursor-pointer transition-colors"
                                                        value=""
                                                        onChange={(e) => handleAddMember(project.id, e.target.value)}
                                                    >
                                                        <option value="">+ Add</option>
                                                        {availableEmployees.filter(u => !project.memberIds.includes(u.id)).map(u => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
