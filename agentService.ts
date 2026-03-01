
import { Task, TaskStatus, ActionType, DecisionLog, User } from './types';
import { computeDecision } from './reasoningEngine';
import { retrieveMemories, addMemory } from './vectorStore';
import { generateDecisionExplanation } from './geminiService';

export interface AgentUpdate {
  updatedTasks: Task[];
  newLogs: DecisionLog[];
}

export const runMonitoringCycle = async (
  tasks: Task[],
  users: User[],
  onLog: (log: DecisionLog) => void,
  onUpdate: (updatedTasks: Task[]) => void
) => {
  const now = Date.now();
  const nextTasks = [...tasks];

  // 1. Init RAG Service (Mock check or lazy init)
  // In real app, this would be done once on app load, but calling here for safety
  // (We'll move init to App.tsx mostly, but ensure retrieval works)

  for (let i = 0; i < nextTasks.length; i++) {
    const task = nextTasks[i];

    // Only monitor active tasks
    if ([TaskStatus.COMPLETED, TaskStatus.SUBMITTED].includes(task.status)) continue;

    const user = users.find(u => u.id === task.assigneeId);
    if (!user) continue;

    // 1. COMPUTE (SLM-first)
    const { riskScore, action, escalationPath } = computeDecision(task, user, now);

    // 2. If action needed and different from last state (prevent spam)
    if (action !== ActionType.NONE && (action !== task.lastAction || riskScore !== task.riskScore)) {

      // 3. RETRIEVE (RAG) - Now Async
      const memories = await retrieveMemories(user.id, task.deptId, task.title);

      // 4. EXPLAIN (LLM - only for significant actions)
      const explanation = await generateDecisionExplanation(task, action, memories, user, riskScore);

      // 5. UPDATE
      const updatedTask: Task = {
        ...task,
        riskScore,
        lastAction: action,
        status: riskScore > 60 ? TaskStatus.AT_RISK : (task.deadline < now ? TaskStatus.OVERDUE : task.status),
        updatedAt: now
      };

      nextTasks[i] = updatedTask;

      const log: DecisionLog = {
        id: `LOG-${Math.random().toString(36).substr(2, 9)}`,
        taskId: task.id,
        timestamp: now,
        action,
        riskScore,
        retrievedMemories: memories,
        explanation,
        escalationPath
      };

      onLog(log);

      // 6. LEARNING LOOP (Self-Improvement)
      // If we just Escalated, let's record that this user/task needed help.
      if (action === ActionType.ESCALATE || action === ActionType.CRITICAL_ESCALATE) {
        const memoryText = `System needed to ${action} task "${task.title}" for User ${user.name} (Risk: ${riskScore}%)`;
        addMemory(memoryText, {
          userId: user.id,
          deptId: user.deptId,
          taskType: "Escalation"
        });
      }
    }
  }

  onUpdate(nextTasks);
};
