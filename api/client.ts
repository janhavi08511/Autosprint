import type { ActionType, DecisionLog, Task } from '../types';

// API Client for MongoDB Backend
const API_BASE_URL = 'http://localhost:8000';

export interface AuthSession {
    access_token: string;
    token_type: 'bearer';
    user: any;
}

export const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('AEIP_ACCESS_TOKEN');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// Generic API call function
export async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options?.headers,
        },
    });

    if (!response.ok) {
        let errorMessage = `API Error: ${response.status}`;
        try {
            const errorData = await response.json();
            // Handle FastAPI validation errors (422)
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    // Validation errors are arrays
                    errorMessage = errorData.detail.map((err: any) =>
                        `${err.loc?.join('.')}: ${err.msg}`
                    ).join(', ');
                } else if (typeof errorData.detail === 'string') {
                    errorMessage = errorData.detail;
                } else {
                    errorMessage = JSON.stringify(errorData.detail);
                }
            }
        } catch (e) {
            // If JSON parsing fails, use status text
            errorMessage = `${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

// ===== User API =====

export interface UserCreate {
    name: string;
    email: string;
    password: string;
    role: string;
    skills?: string[];
}

export interface UserLogin {
    email: string;
    password: string;
}

export const userAPI = {
    getAll: () => apiCall<any[]>('/api/users/'),

    getMe: () => apiCall<any>('/api/users/me'),

    getAssignable: (projectId?: string) => apiCall<any[]>(
        `/api/users/assignable${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`
    ),

    register: (userData: UserCreate) =>
        apiCall<AuthSession>('/api/users/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        }),

    login: (credentials: UserLogin) =>
        apiCall<AuthSession>('/api/users/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        }),

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    updateSkills: (id: string, skills: string[]) =>
        apiCall<any>(`/api/users/${id}/skills`, {
            method: 'PUT',
            body: JSON.stringify(skills),
        }),
};

// ===== Project API =====

export interface ProjectCreate {
    name: string;
    description: string;
    orgId?: string;
}

export const projectAPI = {
    getAll: () => apiCall<any[]>('/api/projects/'),

    getById: (id: string) => apiCall<any>(`/api/projects/${id}`),

    create: (projectData: ProjectCreate) => {
        return apiCall<any>('/api/projects/', {
            method: 'POST',
            body: JSON.stringify(projectData),
        });
    },

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    addMember: (projectId: string, userId: string) =>
        apiCall<any>(`/api/projects/${projectId}/members/${userId}`, {
            method: 'POST',
        }),

    removeMember: (projectId: string, userId: string) =>
        apiCall<any>(`/api/projects/${projectId}/members/${userId}`, {
            method: 'DELETE',
        }),
};

// ===== Task API =====

export interface TaskCreate {
    title: string;
    description: string;
    priority: string;
    deadline: number;
    teamId: string;
    deptId: string;
    orgId?: string;
    projectId?: string;
    requiredSkills?: string[];
    assigneeId?: string;
}

export interface TaskAgentStateUpdate {
    riskScore: number;
    lastAction: ActionType;
}

export interface DecisionTraceInput {
    decisionId: string;
    riskScore: number;
    action: Exclude<ActionType, ActionType.NONE>;
    retrievedMemories: { id: string; text: string; score?: number }[];
    retrievalSource: 'FAISS' | 'LOCAL_FALLBACK' | 'NONE';
    explanation: string;
    explanationSource: 'GEMINI' | 'UNAVAILABLE';
    escalationPath: string[];
}

export interface Notification {
    id: string;
    escalationId: string;
    decisionId: string;
    recipientUserId: string;
    taskId: string;
    taskTitle: string;
    reason: string;
    riskScore: number;
    fromLevel: string;
    toLevel: string;
    action: string;
    status: 'DELIVERED' | 'ACKNOWLEDGED' | 'RESOLVED';
    createdAt: string;
    acknowledgedAt?: string | null;
    resolvedAt?: string | null;
}

const decisionLogFromTrace = (trace: any): DecisionLog => ({
    id: trace.decisionId ?? trace.id,
    taskId: trace.taskId,
    timestamp: trace.timestamp ?? Date.parse(trace.createdAt),
    action: trace.action ?? trace.reasoning?.action,
    riskScore: trace.riskScore ?? trace.reasoning?.riskScore,
    retrievedMemories: trace.retrievedMemories ?? trace.rag?.memories ?? [],
    retrievalSource: trace.retrievalSource ?? trace.rag?.source ?? 'NONE',
    explanation: trace.explanation ?? trace.llm?.explanation ?? '',
    explanationSource: trace.explanationSource
        ?? (trace.llm?.provider === 'Gemini' ? 'GEMINI' : 'UNAVAILABLE'),
    escalationPath: trace.escalationPath ?? trace.reasoning?.escalationPath ?? [],
    escalation: trace.escalation,
    notification: trace.notification,
    execution: trace.execution,
});

export const taskAPI = {
    getAll: (projectId?: string) => apiCall<any[]>(
        `/api/tasks/${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`
    ),

    getById: (id: string) => apiCall<any>(`/api/tasks/${id}`),

    create: (taskData: TaskCreate) =>
        apiCall<any>('/api/tasks/', {
            method: 'POST',
            body: JSON.stringify(taskData),
        }),

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    updateAgentState: (id: string, state: TaskAgentStateUpdate) =>
        apiCall<Task>(`/api/tasks/${id}/agent-state`, {
            method: 'PUT',
            body: JSON.stringify(state),
        }),

    recordDecision: async (id: string, decision: DecisionTraceInput) => {
        const result = await apiCall<{ created: boolean; trace: any; task: Task }>(
            `/api/tasks/${id}/decision-traces`,
            { method: 'POST', body: JSON.stringify(decision) }
        );
        return {
            ...result,
            trace: result.trace ? decisionLogFromTrace(result.trace) : null,
        };
    },

    getDecisionTraces: async (id: string) => {
        const traces = await apiCall<any[]>(`/api/tasks/${id}/decision-traces`);
        return traces.map(decisionLogFromTrace);
    },

    updateExecutionMemory: (decisionId: string, memoryId: string, stored: boolean) =>
        apiCall<any>(`/api/decision-traces/${decisionId}/execution-memory`, {
            method: 'PATCH',
            body: JSON.stringify({ memoryId, stored }),
        }),

    updateStatus: (id: string, status: string) =>
        apiCall<any>(`/api/tasks/${id}/status?new_status=${status}`, {
            method: 'PUT',
        }),

    complete: (id: string, quality?: number, hoursSpent?: number) =>
        apiCall<any>(`/api/tasks/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ quality, hoursSpent }),
        }),

    delete: (id: string) =>
        apiCall<any>(`/api/tasks/${id}`, {
            method: 'DELETE',
        }),
};

export const notificationAPI = {
    getMine: () => apiCall<Notification[]>('/api/notifications/'),

    acknowledge: (id: string) =>
        apiCall<Notification>(`/api/notifications/${id}/acknowledge`, { method: 'POST' }),

    resolve: (id: string) =>
        apiCall<Notification>(`/api/notifications/${id}/resolve`, { method: 'POST' }),
};

// ===== Health Check =====

export const healthAPI = {
    check: () => apiCall<any>('/health'),
};
