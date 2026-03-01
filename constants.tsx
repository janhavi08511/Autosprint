
import React from 'react';

export const Icons = {
  Dashboard: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
      <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
    </svg>
  ),
  Task: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  ),
  Alert: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  Brain: () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5zm1.5 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5zM6 8a4 4 0 0 1 4-4v1a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3V4a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" />
    </svg>
  ),
};

// Skill Categories for Task Assignment
export const SKILL_CATEGORIES = {
  TECHNICAL: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'React', 'Node.js', 'SQL', 'MongoDB', 'AWS', 'Azure', 'GCP'],
  MANAGEMENT: ['Project Management', 'Team Leadership', 'Agile', 'Scrum', 'Stakeholder Management', 'Budget Planning'],
  DESIGN: ['UI/UX Design', 'Figma', 'Adobe XD', 'Graphic Design', 'Prototyping', 'User Research'],
  OPERATIONS: ['DevOps', 'CI/CD', 'Docker', 'Kubernetes', 'System Administration', 'Monitoring'],
  SOFT_SKILLS: ['Communication', 'Problem Solving', 'Critical Thinking', 'Collaboration', 'Time Management'],
  SPECIALIZED: ['Machine Learning', 'Data Analysis', 'Security', 'Mobile Development', 'QA Testing', 'Technical Writing']
};

// Flatten all skills for easy access
export const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat();
