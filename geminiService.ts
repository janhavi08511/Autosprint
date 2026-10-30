import { Task, ActionType, ExplanationSource, User } from "./types";
import { apiCall } from "./api/client";

const UNAVAILABLE_EXPLANATION =
  "Gemini explanation unavailable; the deterministic decision and agent action remain available.";

interface DecisionExplanation {
  text: string;
  source: ExplanationSource;
}

let lastRequestTime = 0;
const MIN_REQ_INTERVAL = 6000;
let backoffUntil = 0;

export async function generateDecisionExplanation(
  task: Task,
  action: ActionType,
  memories: string[],
  user: User,
  riskScore: number
): Promise<DecisionExplanation> {
  const now = Date.now();
  if (now < backoffUntil) {
    return { text: UNAVAILABLE_EXPLANATION, source: "UNAVAILABLE" };
  }

  const waitTime = MIN_REQ_INTERVAL - (now - lastRequestTime);
  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  try {
    const result = await apiCall<{ explanation: string; source: ExplanationSource }>("/api/explanations", {
      method: "POST",
      body: JSON.stringify({
        title: task.title,
        status: task.status,
        priority: task.priority,
        risk_score: riskScore,
        action,
        memories,
        user_role: user.role
      })
    });
    return { text: result.explanation, source: result.source };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("429")) {
      backoffUntil = Date.now() + 30000;
    } else {
      console.error("Explanation request failed:", error);
    }
    return { text: UNAVAILABLE_EXPLANATION, source: "UNAVAILABLE" };
  }
}
