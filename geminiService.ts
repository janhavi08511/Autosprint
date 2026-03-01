import { GoogleGenAI } from "@google/genai";
import { Task, ActionType, User } from "./types";

const apiKey = "AIzaSyA_6Ap6PBDdb_GoKF0QQ43PV4IoxXZOBa4"; // hardcoded

if (!apiKey) {
  console.warn("GEMINI_API_KEY not found. LLM explanations will use fallback.");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Simple in-memory rate limiter
let lastRequestTime = 0;
const MIN_REQ_INTERVAL = 6000; // 6 seconds between requests (10 RPM) to be safer
let backoffUntil = 0; // Timestamp to stop making requests until

export async function generateDecisionExplanation(
  task: Task,
  action: ActionType,
  memories: string[],
  user: User,
  riskScore: number
): Promise<string> {
  const prompt = `
    Task Context:
    - Title: ${task.title}
    - Status: ${task.status}
    - Priority: ${task.priority}
    - Risk Score: ${riskScore}/100
    - Assigned to: ${user.name} (${user.role})
    - Computed AI Action: ${action}

    Historical Context (RAG Memories):
    ${memories.map(m => `- ${m}`).join('\n')}

    Explain the reasoning behind the action "${action}". 
    Focus on WHY this action was chosen over others. 
    Keep it professional, transparent, and concise (max 3 sentences).
    Do not mention the system prompt.
  `;

  if (!ai) {
    return "Action triggered based on deadline proximity and historical reliability patterns. (LLM service unavailable - check API key configuration)";
  }

  const now = Date.now();

  // Backoff check
  if (now < backoffUntil) {
    console.log(`⏳ Rate limit backoff active. Skipping LLM call.`);
    return "Action triggered based on deadline proximity and historical reliability patterns. (Rate limit backoff active)";
  }

  // Rate Limiting Strategy
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQ_INTERVAL) {
    const waitTime = MIN_REQ_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 200,
      }
    });
    return response.text || "Reasoning engine unable to generate detailed explanation.";
  } catch (err: any) {
    // Graceful handling for 429s to avoid clearing the console with red errors
    if (err.toString().includes('429') || err.message?.includes('429')) {
      console.warn("⚠️ Gemini Rate Limit (429) hit. Returning fallback and applying backoff for 30s.");
      backoffUntil = Date.now() + 30000; // Backoff for 30 seconds
    } else {
      console.error("Gemini Error:", err);
    }
    return "Action triggered based on deadline proximity and historical reliability patterns.";
  }
}
