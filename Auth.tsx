import React, { useState } from 'react';
import { User, UserRole } from './types';
import { MOCK_ORG_ID } from './mockData';
import { ALL_SKILLS } from './constants';
import { userAPI } from './api/client';

interface AuthProps {
    onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: UserRole.ASSIGNEE,
    });
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(null);
    };

    const handleSkillToggle = (skill: string) => {
        setSelectedSkills(prev =>
            prev.includes(skill)
                ? prev.filter(s => s !== skill)
                : [...prev, skill]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isLogin) {
                // Login using MongoDB API
                const user = await userAPI.login({
                    email: formData.email,
                    password: formData.password
                });
                onLogin(user);
            } else {
                // Register using MongoDB API
                const newUser = await userAPI.register({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    role: formData.role,
                    skills: selectedSkills.length > 0 ? selectedSkills : ['General']
                });
                onLogin(newUser);
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred. Make sure MongoDB backend is running.');
            console.error('Auth error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center flex items-center justify-center p-6 relative">
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-0"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="glass-panel p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 mx-auto mb-6">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
                            {isLogin ? 'Welcome Back' : 'Join the Team'}
                        </h1>
                        <p className="text-slate-400 text-sm">
                            {isLogin ? 'Authenticate to access the Intelligence Layer' : 'Register a new agentic identity'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-white placeholder-slate-600 transition-all hover:bg-black/30"
                                    placeholder="e.g. Alex Chen"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-white placeholder-slate-600 transition-all hover:bg-black/30"
                                placeholder="name@company.com"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-white placeholder-slate-600 transition-all hover:bg-black/30"
                                placeholder="••••••••"
                            />
                        </div>

                        {!isLogin && (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        Role
                                    </label>
                                    <div className="relative">
                                        <select
                                            name="role"
                                            value={formData.role}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none text-white appearance-none cursor-pointer hover:bg-black/30 transition-all"
                                        >
                                            <option value={UserRole.ASSIGNEE} className="bg-slate-900">Employee</option>
                                            <option value={UserRole.TEAM_LEAD} className="bg-slate-900">Team Lead</option>
                                            <option value={UserRole.MANAGER} className="bg-slate-900">Manager</option>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        Expertise (Select relevant skills)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-black/20 border border-white/10 rounded-xl custom-scrollbar">
                                        {ALL_SKILLS.slice(0, 20).map(skill => (
                                            <label key={skill} className={`flex items-center space-x-2 cursor-pointer p-2 rounded-lg transition-all ${selectedSkills.includes(skill) ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-white/5 border border-transparent'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSkills.includes(skill)}
                                                    onChange={() => handleSkillToggle(skill)}
                                                    className="rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                                                />
                                                <span className={`text-xs font-medium ${selectedSkills.includes(skill) ? 'text-indigo-300' : 'text-slate-400'}`}>{skill}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-indigo-400 mt-2 text-right">
                                        {selectedSkills.length} skills selected
                                    </p>
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 px-4 rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Authenticating...
                                </span>
                            ) : (isLogin ? 'Sign In to Console' : 'Create Agentic ID')}
                        </button>
                    </form>

                    <div className="mt-8 text-center border-t border-white/5 pt-6">
                        <p className="text-slate-500 text-sm mb-2">
                            {isLogin ? "New to the platform?" : 'Already authenticated?'}
                        </p>
                        <button
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError(null);
                            }}
                            className="text-indigo-400 hover:text-white font-bold text-sm tracking-wide uppercase hover:underline transition-colors"
                        >
                            {isLogin ? "Request Access" : 'Return to Login'}
                        </button>
                    </div>
                </div>
                <p className="text-center text-slate-600 text-[10px] mt-6 tracking-widest uppercase opacity-50">
                    Secured by AEIP Intelligence Layer v2.4
                </p>
            </div>
        </div>
    );
};
