"""
Performance calculation service for AI-based task assignment learning.

This service tracks task completion outcomes and updates user performance scores
based on historical data with time decay.
"""

from datetime import datetime, timedelta
from typing import List, Optional
import math

async def calculate_user_performance(db, user_id: str) -> float:
    """
    Calculate user's performance score based on historical task completions.
    
    Formula:
    - On-time rate: 40%
    - Average quality: 40%
    - Completion rate: 20%
    
    Recent tasks weighted higher using exponential time decay.
    
    Args:
        db: Database instance
        user_id: User ID to calculate performance for
        
    Returns:
        Performance score between 0 and 1
    """
    # Get recent performance history (last 90 days)
    ninety_days_ago = int((datetime.utcnow() - timedelta(days=90)).timestamp() * 1000)
    
    history = await db.performance_history.find({
        "userId": user_id,
        "completedAt": {"$gte": ninety_days_ago}
    }).to_list(100)
    
    if not history:
        return 0.5  # Default for new users
    
    # Get total assigned tasks in same period
    total_assigned = await db.tasks.count_documents({
        "assigneeId": user_id,
        "createdAt": {"$gte": datetime.utcnow() - timedelta(days=90)}
    })
    
    if total_assigned == 0:
        return 0.5
    
    # Calculate metrics with time decay
    now = datetime.utcnow().timestamp() * 1000
    total_weight = 0
    weighted_on_time = 0
    weighted_quality = 0
    
    for record in history:
        # Time decay: recent tasks matter more
        days_ago = (now - record["completedAt"]) / (1000 * 60 * 60 * 24)
        weight = math.exp(-days_ago / 30)  # Decay over 30 days
        
        total_weight += weight
        weighted_on_time += record["wasOnTime"] * weight
        weighted_quality += record["quality"] * weight
    
    # Calculate averages
    on_time_rate = weighted_on_time / total_weight if total_weight > 0 else 0.5
    avg_quality = weighted_quality / total_weight if total_weight > 0 else 0.5
    completion_rate = len(history) / total_assigned
    
    # Final score
    performance_score = (
        on_time_rate * 0.4 +
        avg_quality * 0.4 +
        completion_rate * 0.2
    )
    
    return min(max(performance_score, 0.0), 1.0)  # Clamp to [0, 1]


async def update_user_performance(db, user_id: str):
    """
    Recalculate and update user's reliability score based on latest performance data.
    
    Args:
        db: Database instance
        user_id: User ID to update
    """
    new_score = await calculate_user_performance(db, user_id)
    
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "reliabilityScore": new_score,
                "updatedAt": datetime.utcnow()
            }
        }
    )
    
    print(f"📊 Updated performance score for user {user_id}: {new_score:.2f}")
    return new_score


async def record_task_completion(db, task_id: str, quality: Optional[float] = None, hours_spent: Optional[float] = None):
    """
    Record task completion in performance history and update user score.
    
    Args:
        db: Database instance
        task_id: Task ID that was completed
        quality: Quality rating (0-1)
        hours_spent: Optional hours spent on task
        
    Returns:
        PerformanceHistory record
    """
    # Get task details
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise ValueError(f"Task {task_id} not found")
    
    # Calculate completion metrics
    completed_at = int(datetime.utcnow().timestamp() * 1000)
    was_on_time = completed_at <= task["deadline"]
    
    # Auto-calculate hours spent if not provided
    if hours_spent is None:
        # Calculate duration from creation time
        created_at = task.get("createdAt")
        if created_at:
            # Handle if stored as string or datetime object
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except ValueError:
                    # Fallback if format issue
                    created_at = datetime.utcnow()
            
            delta = datetime.utcnow() - created_at
            hours_spent = max(0.1, delta.total_seconds() / 3600)  # Minimum 6 mins
        else:
            hours_spent = 1.0  # Default fallback
            
    # Default quality if not provided
    if quality is None:
        quality = 1.0  # Default to perfect score when automated
    
    # Create performance history record
    perf_id = f"PERF-{int(datetime.utcnow().timestamp() * 1000)}"
    performance_record = {
        "id": perf_id,
        "userId": task["assigneeId"],
        "taskId": task_id,
        "completedAt": completed_at,
        "wasOnTime": was_on_time,
        "quality": quality,
        "skillsUsed": task.get("requiredSkills", []),
        "hoursSpent": hours_spent,
        "taskPriority": task["priority"]
    }
    
    # Insert performance record
    await db.performance_history.insert_one(performance_record)
    
    # Update task with completion data
    await db.tasks.update_one(
        {"id": task_id},
        {
            "$set": {
                "status": "COMPLETED",
                "completedAt": completed_at,
                "completionQuality": quality,
                "wasOnTime": was_on_time,
                "actualHours": hours_spent,
                "updatedAt": datetime.utcnow()
            }
        }
    )
    
    # Update user performance score
    await update_user_performance(db, task["assigneeId"])
    
    print(f"✅ Recorded completion for task {task_id}: quality={quality}, on-time={was_on_time}")
    
    return performance_record


async def get_user_workload(db, user_id: str) -> int:
    """
    Get count of active tasks assigned to user.
    
    Args:
        db: Database instance
        user_id: User ID
        
    Returns:
        Number of active tasks
    """
    return await db.tasks.count_documents({
        "assigneeId": user_id,
        "status": {"$in": ["CREATED", "IN_PROGRESS"]}
    })
