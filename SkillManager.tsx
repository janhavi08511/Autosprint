import React, { useState } from 'react';
import { User } from './types';
import { ALL_SKILLS, SKILL_CATEGORIES } from './constants';

interface SkillManagerProps {
    currentUser: User;
    onUpdateSkills: (updatedUser: User) => void;
    onClose: () => void;
}

export const SkillManager: React.FC<SkillManagerProps> = ({ currentUser, onUpdateSkills, onClose }) => {
    const [selectedSkills, setSelectedSkills] = useState<string[]>(currentUser.skills || []);
    const [activeCategory, setActiveCategory] = useState<string>('TECHNICAL');

    const handleSkillToggle = (skill: string) => {
        setSelectedSkills(prev =>
            prev.includes(skill)
                ? prev.filter(s => s !== skill)
                : [...prev, skill]
        );
    };

    const handleSave = () => {
        const updatedUser = { ...currentUser, skills: selectedSkills };

        // Update in localStorage
        const storedUsersStr = localStorage.getItem('AEIP_USERS');
        if (storedUsersStr) {
            const storedUsers: User[] = JSON.parse(storedUsersStr);
            const updatedUsers = storedUsers.map(u =>
                u.id === currentUser.id ? updatedUser : u
            );
            localStorage.setItem('AEIP_USERS', JSON.stringify(updatedUsers));
        }

        // Update current user session
        localStorage.setItem('AEIP_CURRENT_USER', JSON.stringify(updatedUser));

        onUpdateSkills(updatedUser);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Manage Your Skills</h2>
                            <p className="text-sm text-slate-600 mt-1">
                                Select skills to improve task matching and assignment accuracy
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full hover:bg-white/50 flex items-center justify-center text-slate-600 hover:text-slate-800 transition"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Selected Skills Count */}
                    <div className="mt-4 flex items-center gap-2">
                        <div className="px-3 py-1 bg-indigo-500 text-white rounded-full text-sm font-bold">
                            {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''} selected
                        </div>
                        {selectedSkills.length > 0 && (
                            <button
                                onClick={() => setSelectedSkills([])}
                                className="text-xs text-red-500 hover:text-red-700 font-medium underline"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="border-b border-slate-200 bg-slate-50 px-6 overflow-x-auto">
                    <div className="flex gap-2 py-3">
                        {Object.keys(SKILL_CATEGORIES).map(category => (
                            <button
                                key={category}
                                onClick={() => setActiveCategory(category)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition whitespace-nowrap ${activeCategory === category
                                        ? 'bg-indigo-500 text-white shadow-md'
                                        : 'bg-white text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                {category.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Skills Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {SKILL_CATEGORIES[activeCategory as keyof typeof SKILL_CATEGORIES].map(skill => {
                            const isSelected = selectedSkills.includes(skill);
                            return (
                                <button
                                    key={skill}
                                    onClick={() => handleSkillToggle(skill)}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${isSelected
                                            ? 'border-indigo-500 bg-indigo-50 shadow-md'
                                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                            {skill}
                                        </span>
                                        {isSelected && (
                                            <svg className="w-5 h-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected Skills Preview */}
                {selectedSkills.length > 0 && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Selected Skills</p>
                        <div className="flex flex-wrap gap-2">
                            {selectedSkills.map(skill => (
                                <span
                                    key={skill}
                                    className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium flex items-center gap-2"
                                >
                                    {skill}
                                    <button
                                        onClick={() => handleSkillToggle(skill)}
                                        className="hover:text-indigo-900"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="p-6 border-t border-slate-200 bg-slate-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-100 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-6 py-3 bg-indigo-500 text-white rounded-lg font-bold hover:bg-indigo-600 transition shadow-lg shadow-indigo-500/25"
                    >
                        Save Skills
                    </button>
                </div>
            </div>
        </div>
    );
};
