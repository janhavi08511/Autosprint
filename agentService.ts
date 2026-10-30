
import { Task, TaskStatus, ActionType, DecisionLog, User } from './types';
import { computeDecision, isActionUpgrade } from './reasoningEngine';
import { retrieveMemories, addMemory } from './vectorStore';
import { generateDecisionExplanation } from './geminiService';
import { taskAPI } from './api/client';

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
    if ([TaskStatus.COMPLETED, TaskStatus.SUBMITTED].includes(task.status)) continue;

    const user = users.find(u => u.id === task.assigneeId);
    if (!user) continue;

    try {
      const { riskScore, action, escalationPath } = computeDecision(task, user, now);
      const previousAction = task.lastAction ?? ActionType.NONE;
      const actionChanged = isActionUpgrade(action, previousAction);
      const persistedAction = actionChanged ? action : previousAction;
      const stateChanged = riskScore !== task.riskScore || persistedAction !== task.lastAction;
      if (!stateChanged) continue;

      const retrieval = actionChanged
        ? await retrieveMemories(user.id, task.deptId, task.title)
        : { memories: [], source: 'NONE' as const };
      const explanation = actionChanged
        ? await generateDecisionExplanation(
            task,
            action,
            retrieval.memories.map(memory => memory.text),
            user,
            riskScore
          )
        : null;

      if (actionChanged) {
        const decisionId = `DEC-${crypto.randomUUID()}`;
        const result = await taskAPI.recordDecision(task.id, {
          decisionId,
          action,
          riskScore,
          retrievedMemories: retrieval.memories,
          retrievalSource: retrieval.source,
          explanation: explanation?.text ?? '',
          explanationSource: explanation?.source ?? 'UNAVAILABLE',
          escalationPath,
        });
        if (result.task) nextTasks[i] = result.task;
        if (!result.created || !result.trace) continue;

        let log: DecisionLog = result.trace;
        onLog(log);

        if (action === ActionType.ESCALATE || action === ActionType.CRITICAL_ESCALATE) {
          const memoryId = `MEM-${decisionId}`;
          const memory = await addMemory(
            `Task "${task.title}" (${task.priority}) required ${action} at risk ${riskScore}/100. ` +
              `Task description: ${task.description}. ` +
              `Historical context: ${retrieval.memories.map(item => item.text).join(' ')}`,
            {
              user_id: user.id,
              dept_id: user.deptId,
              task_type: "Escalation",
              decision_id: decisionId,
            },
            memoryId
          );
          await taskAPI.updateExecutionMemory(decisionId, memory.id, memory.stored);
          log = {
            ...log,
            execution: {
              status: memory.stored ? 'MEMORY_STORED' : 'MEMORY_UNAVAILABLE',
              memoryId: memory.id,
              memoryStored: memory.stored,
            },
          };
          onLog(log);
        }
      } else {
        const updatedTask = await taskAPI.updateAgentState(task.id, {
          riskScore,
          lastAction: persistedAction,
        });
        nextTasks[i] = updatedTask;
      }
    } catch (error) {
      console.error(`Monitoring failed for task ${task.id}:`, error);
    }
  }

  onUpdate(nextTasks);
};
