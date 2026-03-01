from fastapi import APIRouter, HTTPException, status
from typing import List
from datetime import datetime
from models import Task, TaskCreate, TaskUpdate, TaskComplete, MessageResponse
from database import get_database

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

@router.get("/", response_model=List[Task])
async def get_all_tasks(user_id: str = None, project_id: str = None):
    """Get all tasks, filtered by user access"""
    db = get_database()
    
    if not user_id:
        # If no user_id provided, return all tasks (Frontend filters by role later)
        tasks = await db.tasks.find().to_list(1000)
        return tasks

    # Case 1: Fetching tasks for a specific project
    if project_id:
        # Check Project Access
        project = await db.projects.find_one({"id": project_id})
        if not project:
            return []
            
        has_access = False
        # Direct access (Lead/Member)
        if project.get("leadId") == user_id or user_id in project.get("memberIds", []):
            has_access = True
        else:
            # Check if user has ANY task in this project (Contributor)
            task_count = await db.tasks.count_documents({"projectId": project_id, "assigneeId": user_id})
            if task_count > 0:
                has_access = True
        
        if not has_access:
            return []
        
        # Return tasks for this project
        tasks = await db.tasks.find({"projectId": project_id}).to_list(1000)
        return tasks

    # Case 2: Global task list (no project context)
    else:
        # Get projects where user is lead/member
        owned_projects = await db.projects.find({
            "$or": [{"leadId": user_id}, {"memberIds": user_id}]
        }, {"id": 1}).to_list(1000)
        
        owned_project_ids = [p["id"] for p in owned_projects]
        
        # Query: Assignee is user OR task belongs to a project the user leads/is member of
        query = {
            "$or": [
                {"assigneeId": user_id},
                {"projectId": {"$in": owned_project_ids}}
            ]
        }
        
        tasks = await db.tasks.find(query).to_list(1000)
        return tasks

@router.get("/{task_id}", response_model=Task)
async def get_task(task_id: str):
    """Get task by ID"""
    db = get_database()
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.post("/", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(task_data: TaskCreate):
    """Create a new task"""
    db = get_database()
    
    # Auto-assign if no assignee provided
    assignee_id = task_data.assigneeId
    if not assignee_id:
        # If task belongs to a project, only consider members/lead. Otherwise, consider all non-admins.
        if task_data.projectId:
            project = await db.projects.find_one({"id": task_data.projectId})
            if project:
                eligible_user_ids = project.get("memberIds", [])
                if project.get("leadId"):
                    eligible_user_ids.append(project.get("leadId"))
                
                users = await db.users.find({
                    "id": {"$in": eligible_user_ids},
                    "role": {"$ne": "ADMIN"}
                }).to_list(1000)
            else:
                users = []
        else:
            # Get eligible users (all roles except ADMIN)
            users = await db.users.find({
                "role": {"$ne": "ADMIN"}
            }).to_list(1000)
        
        if users:
            # Enhanced AI auto-assignment: Skills + Reliability + Workload
            best_match = None
            best_score = -1.0
            
            print(f"🤖 AI Auto-Assign: Analyzing {len(users)} candidates for task '{task_data.title}'")
            
            required_skills = set(task_data.requiredSkills) if task_data.requiredSkills else set()
            
            for user in users:
                user_skills = set(user.get("skills", []))
                
                skill_score = 1.0
                # 1. Skill Matching (If required skills are provided)
                if required_skills:
                    intersection = user_skills.intersection(required_skills)
                    if not intersection:
                        continue  # Skip users with NO matching skills
                    
                    # Calculate skill coverage score (0.0 - 1.0)
                    skill_score = len(intersection) / len(required_skills)
                
                # 2. Reliability Score (High Weight as requested)
                performance_score = user.get("reliabilityScore", 0.5)
                
                # 3. Workload balancing
                active_tasks = await db.tasks.count_documents({
                    "assigneeId": user["id"],
                    "status": {"$in": ["CREATED", "IN_PROGRESS"]}
                })
                # Penalize users with many active tasks (Strafing for >5 tasks)
                workload_score = max(0, 1 - (active_tasks / 5))
                
                # 4. Role Preference (Prefer ASSIGNEE over TEAM_LEAD)
                role_bonus = 0.1 if user.get("role") == "ASSIGNEE" else 0.0
                
                # 5. Context Bonus (Same Dept)
                context_bonus = 0.1 if user.get("deptId") == task_data.deptId else 0.0
                
                # Weighted Score Formula
                # Skills: 40%, Reliability: 40%, Workload: 20% + Bonuses
                score = (
                    skill_score * 0.4 +
                    performance_score * 0.4 +
                    workload_score * 0.2 +
                    role_bonus +
                    context_bonus
                )
                
                print(f"   - User {user.get('name')} ({user.get('role')}): Skill={skill_score:.2f}, Perf={performance_score:.2f}, Load={workload_score:.2f}, Bonus={role_bonus+context_bonus:.1f} -> Total={score:.2f}")
                
                if score > best_score:
                    best_score = score
                    best_match = user
            
            if best_match:
                assignee_id = best_match["id"]
                print(f"✅ AI Selected: {best_match.get('name')} (Score: {best_score:.2f})")
    
    # If still no assignee, assign to task creator (fallback)
    if not assignee_id:
        # Use the teamId or deptId to find a default assignee
        # For now, we'll require manual assignment or skills
        raise HTTPException(
            status_code=400, 
            detail="No suitable assignee found. Please specify skills or manually assign a user."
        )
    
    # Create new task
    task_id = f"TASK-{int(datetime.utcnow().timestamp() * 1000)}"
    new_task = Task(
        id=task_id,
        title=task_data.title,
        description=task_data.description,
        status="CREATED",
        priority=task_data.priority,
        deadline=task_data.deadline,
        assigneeId=assignee_id,
        teamId=task_data.teamId,
        deptId=task_data.deptId,
        orgId=task_data.orgId,
        projectId=task_data.projectId,
        requiredSkills=task_data.requiredSkills,
        riskScore=0,
        lastAction="NONE"
    )
    
    await db.tasks.insert_one(new_task.model_dump())
    return new_task

@router.put("/{task_id}", response_model=Task)
async def update_task(task_id: str, task_update: TaskUpdate):
    """Update task information"""
    db = get_database()
    
    # Check if task exists
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update fields
    update_data = {k: v for k, v in task_update.model_dump().items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow()
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # Return updated task
    updated_task = await db.tasks.find_one({"id": task_id})
    return updated_task

@router.put("/{task_id}/status", response_model=Task)
async def update_task_status(task_id: str, new_status: str):
    """Update task status"""
    db = get_database()
    
    # Check if task exists
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update status
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": new_status, "updatedAt": datetime.utcnow()}}
    )
    
    # Return updated task
    updated_task = await db.tasks.find_one({"id": task_id})
    return updated_task

@router.delete("/{task_id}", response_model=MessageResponse)
async def delete_task(task_id: str):
    """Delete task"""
    db = get_database()
    
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return MessageResponse(message="Task deleted successfully")

@router.post("/{task_id}/complete", response_model=Task)
async def complete_task(task_id: str, completion_data: TaskComplete):
    """
    Mark task as completed and record performance metrics.
    This triggers AI learning by updating the assignee's performance score.
    """
    from services.performance_service import record_task_completion
    
    db = get_database()
    
    # Check if task exists
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Record completion and update performance
    await record_task_completion(
        db,
        task_id,
        completion_data.quality,
        completion_data.hoursSpent
    )
    
    # Return updated task
    updated_task = await db.tasks.find_one({"id": task_id})
    return updated_task
