import { MemoryRecord } from './types';
import { MEMORY_POOL } from './mockData';

const API_URL = 'http://localhost:8000';

export const retrieveMemories = async (
  userId: string,
  deptId: string,
  taskTitle: string,
  topK: number = 3
): Promise<string[]> => {
  try {
    // Construct a semantic query
    const queryText = `Task: ${taskTitle} for User: ${userId} in Dept: ${deptId}`;

    const response = await fetch(`${API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: queryText,
        top_k: topK,
        filter_user_id: userId, // Optional: Filter by user
        // filter_dept_id: deptId 
      })
    });

    if (!response.ok) throw new Error('RAG Service unavailable');

    const results = await response.json();
    return results.map((r: any) => r.text);
  } catch (error) {
    console.error("RAG Service Error (using fallback):", error);
    // Fallback to local heuristic if service is down
    return heuristicRetrieve(userId, deptId, taskTitle, topK);
  }
};

export const addMemory = async (
  text: string,
  metadata: { userId?: string; deptId?: string; taskType?: string }
) => {
  try {
    await fetch(`${API_URL}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `MEM-${Date.now()}`,
        text,
        metadata
      })
    });
  } catch (error) {
    console.error("Failed to learn new memory:", error);
  }
};

export const initMemories = async () => {
  try {
    await fetch(`${API_URL}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    console.log("RAG Service Seeded.");
  } catch (error) {
    console.error("Failed to seed RAG Service:", error);
  }
};

// --- Fallback (Old Logic) ---
const heuristicRetrieve = (userId: string, deptId: string, taskTitle: string, topK: number): string[] => {
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
    .map(m => m.summary);
};
