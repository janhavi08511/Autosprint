import { DecisionMemory, MemoryRecord } from './types';
import { MEMORY_POOL } from './mockData';
import { getAuthHeaders } from './api/client';

const API_URL = 'http://localhost:8000';
const MIN_RAG_SIMILARITY = 0.3;

export interface MemoryRetrieval {
  memories: DecisionMemory[];
  source: 'FAISS' | 'LOCAL_FALLBACK' | 'NONE';
}

export const retrieveMemories = async (
  userId: string,
  deptId: string,
  taskTitle: string,
  topK: number = 3
): Promise<MemoryRetrieval> => {
  try {
    // Construct a semantic query
    const queryText = `Task: ${taskTitle} for User: ${userId} in Dept: ${deptId}`;

    const response = await fetch(`${API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        text: queryText,
        top_k: topK,
        filter_user_id: userId, // Optional: Filter by user
        // filter_dept_id: deptId 
      })
    });

    if (!response.ok) throw new Error('RAG Service unavailable');

    const results: DecisionMemory[] = await response.json();
    return {
      memories: results
        .filter(result => typeof result.score === 'number' && result.score >= MIN_RAG_SIMILARITY)
        .map(({ id, text, score }) => ({ id, text, score })),
      source: 'FAISS',
    };
  } catch (error) {
    console.error("RAG Service Error (using fallback):", error);
    // Fallback to local heuristic if service is down
    const memories = heuristicRetrieve(userId, deptId, taskTitle, topK);
    return {
      memories,
      source: memories.length ? 'LOCAL_FALLBACK' : 'NONE',
    };
  }
};

export const addMemory = async (
  text: string,
  metadata: { user_id?: string; dept_id?: string; task_type?: string; decision_id?: string },
  memoryId = `MEM-${crypto.randomUUID()}`
): Promise<{ id: string; stored: boolean }> => {
  try {
    const response = await fetch(`${API_URL}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        id: memoryId,
        text,
        metadata: {
          user_id: metadata.user_id,
          dept_id: metadata.dept_id,
          task_type: metadata.task_type,
          decision_id: metadata.decision_id,
        }
      })
    });
    if (!response.ok) throw new Error(`RAG add failed: ${response.status}`);
    const result: { id: string } = await response.json();
    return { id: result.id, stored: true };
  } catch (error) {
    console.error("Failed to learn new memory:", error);
    return { id: memoryId, stored: false };
  }
};

export const initMemories = async () => {
  try {
    const response = await fetch(`${API_URL}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(MEMORY_POOL.map(m => ({
        id: m.id,
        text: m.summary,
        metadata: {
          user_id: m.userId,
          dept_id: m.deptId,
          task_type: m.taskType
        }
      })))
    });
    if (!response.ok) throw new Error(`RAG initialization failed: ${response.status}`);
    console.log("RAG Service Seeded.");
  } catch (error) {
    console.error("Failed to seed RAG Service:", error);
  }
};

// --- Fallback (Old Logic) ---
const heuristicRetrieve = (
  userId: string,
  deptId: string,
  taskTitle: string,
  topK: number
): DecisionMemory[] => {
  const scored = MEMORY_POOL.map(m => {
    let score = 0;
    if (m.userId === userId) score += 5;
    if (m.deptId === deptId) score += 3;
    if (m.taskType && taskTitle.toLowerCase().includes(m.taskType.toLowerCase())) score += 4;
    return { ...m, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(m => ({ id: m.id, text: m.summary }));
};
