
import { Task, TaskStatus, ActionType, User } from './types';

/**
 * Cost-optimized reasoning. 
 * First, calculate risk score and action deterministically.
 */
export const computeDecision = (
  task: Task,
  user: User,
  now: number
): { riskScore: number; action: ActionType; escalationPath: string[] } => {
  const timeLeft = task.deadline - now;
  const hoursLeft = timeLeft / (1000 * 60 * 60);
  
  let riskScore = 0;
  let action = ActionType.NONE;
  let escalationPath: string[] = [];

  // 1. BASE RISK from deadline
  if (hoursLeft < 0) {
    riskScore += 60; // Overdue
  } else if (hoursLeft < 2) {
    riskScore += 40; // Critical window
  } else if (hoursLeft < 6) {
    riskScore += 20; // Tight window
  }

  // 2. STATUS modifier
  if (task.status === TaskStatus.CREATED && hoursLeft < 1) riskScore += 20;
  if (task.status === TaskStatus.IN_PROGRESS && hoursLeft < 0) riskScore += 10;

  // 3. PRIORITY modifier
  if (task.priority === 'HIGH') riskScore *= 1.2;
  if (task.priority === 'MEDIUM') riskScore *= 1.0;
  if (task.priority === 'LOW') riskScore *= 0.8;

  // 4. RELIABILITY modifier
  riskScore += (1 - user.reliabilityScore) * 30;

  riskScore = Math.min(100, Math.round(riskScore));

  // 5. DETERMINE ACTION based on hierarchy and risk
  if (riskScore > 85) {
    action = ActionType.CRITICAL_ESCALATE;
    escalationPath = [user.name, "Team Lead", "Dept Manager", "Admin"];
  } else if (riskScore > 65) {
    action = ActionType.ESCALATE;
    escalationPath = [user.name, "Team Lead", "Dept Manager"];
  } else if (riskScore > 40) {
    action = ActionType.RISK_ALERT;
    escalationPath = [user.name, "Team Lead"];
  } else if (riskScore > 20) {
    action = ActionType.REMIND;
    escalationPath = [user.name];
  }

  // Overdue status always triggers at least a Remind
  if (hoursLeft < 0 && action === ActionType.NONE) {
    action = ActionType.REMIND;
    escalationPath = [user.name];
  }

  return { riskScore, action, escalationPath };
};
