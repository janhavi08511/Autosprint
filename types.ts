
export enum TaskStatus {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  COMPLETED = 'COMPLETED',
  AT_RISK = 'AT_RISK',
  OVERDUE = 'OVERDUE',
  ESCALATED = 'ESCALATED'
}

export enum UserRole {
  ASSIGNEE = 'ASSIGNEE',
  TEAM_LEAD = 'TEAM_LEAD',
  MANAGER = 'MANAGER', // Keeping for backward compat, effectively Team Lead
  ADMIN = 'ADMIN' // Organization
}

export enum ActionType {
  REMIND = 'REMIND',
  RISK_ALERT = 'RISK_ALERT',
  ESCALATE = 'ESCALATE',
  CRITICAL_ESCALATE = 'CRITICAL_ESCALATE',
  NONE = 'NONE'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  teamId: string;
  deptId: string;
  reliabilityScore: number; // 0-1 (displayed as 0-10 in UI)
  skills: string[]; // User's skillset
  email?: string; // Added for login
  password?: string; // Added for login (mock)
}

export interface Department {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  deptId: string;
  leadId: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  orgId: string;
  leadId?: string;
  memberIds: string[];
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  deadline: number; // timestamp
  startDate: number; // Planned start
  estimatedDuration: number; // in minutes
  dependencies: string[]; // Task IDs
  actualStartDate?: number;
  assigneeId: string;
  teamId: string;
  deptId: string;
  orgId: string;
  projectId?: string; // Linked to Project
  requiredSkills?: string[]; // Skills needed for this task
  riskScore: number;
  lastAction: ActionType;
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  summary: string;
  userId?: string;
  deptId?: string;
  taskType?: string;
  timestamp: number;
  vector?: number[]; // Simulated for the MVP
}

export interface DecisionLog {
  id: string;
  taskId: string;
  timestamp: number;
  action: ActionType;
  riskScore: number;
  retrievedMemories: string[];
  explanation: string;
  escalationPath: string[];
}
