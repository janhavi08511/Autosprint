from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_current_user
from database import get_database
from models import (
    MessageResponse,
    Task,
    TaskAgentStateUpdate,
    TaskComplete,
    TaskCreate,
    TaskUpdate,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])
MANAGER_ROLES = {"ADMIN", "TEAM_LEAD", "MANAGER"}


async def accessible_task(db, task_id: str, user: dict) -> dict:
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.get("role") == "ADMIN" or task.get("assigneeId") == user["id"]:
        return task
    if user.get("role") in {"TEAM_LEAD", "MANAGER"}:
        if task.get("teamId") == user.get("teamId"):
            return task
        if task.get("projectId"):
            project = await db.projects.find_one(
                {"id": task["projectId"], "leadId": user["id"]}
            )
            if project:
                return task
    if task.get("projectId"):
        project = await db.projects.find_one({"id": task["projectId"]})
        if project and (
            project.get("leadId") == user["id"]
            or user["id"] in project.get("memberIds", [])
        ):
            return task
    raise HTTPException(status_code=403, detail="Task access denied")


async def can_manage_task(db, task: dict, user: dict) -> bool:
    if user.get("role") == "ADMIN":
        return True
    if user.get("role") not in {"TEAM_LEAD", "MANAGER"}:
        return False
    if task.get("teamId") == user.get("teamId"):
        return True
    if task.get("projectId"):
        project = await db.projects.find_one(
            {"id": task["projectId"], "leadId": user["id"]}
        )
        return project is not None
    return False


@router.get("/", response_model=List[Task])
async def get_all_tasks(
    project_id: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    role = current_user.get("role")
    if role == "ADMIN":
        query: dict = {}
    elif role in {"TEAM_LEAD", "MANAGER"}:
        projects = await db.projects.find(
            {"$or": [{"leadId": current_user["id"]}, {"memberIds": current_user["id"]}]},
            {"id": 1},
        ).to_list(1000)
        project_ids = [project["id"] for project in projects]
        query = {
            "$or": [
                {"teamId": current_user.get("teamId")},
                {"projectId": {"$in": project_ids}},
                {"assigneeId": current_user["id"]},
            ]
        }
    else:
        projects = await db.projects.find(
            {"memberIds": current_user["id"]}, {"id": 1}
        ).to_list(1000)
        query = {
            "$or": [
                {"assigneeId": current_user["id"]},
                {"projectId": {"$in": [project["id"] for project in projects]}},
            ]
        }
    if project_id:
        project = await db.projects.find_one({"id": project_id})
        if not project:
            return []
        permitted = (
            role == "ADMIN"
            or project.get("leadId") == current_user["id"]
            or current_user["id"] in project.get("memberIds", [])
            or await db.tasks.find_one(
                {"projectId": project_id, "assigneeId": current_user["id"]}
            )
            is not None
        )
        if not permitted:
            raise HTTPException(status_code=403, detail="Project task access denied")
        query = {"$and": [query, {"projectId": project_id}]}
    return await db.tasks.find(query).to_list(1000)


@router.get("/{task_id}", response_model=Task)
async def get_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await accessible_task(get_database(), task_id, current_user)


@router.post("/", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Task creation denied")
    db = get_database()
    project = None
    if task_data.projectId:
        project = await db.projects.find_one({"id": task_data.projectId})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if current_user.get("role") != "ADMIN" and not (
            project.get("leadId") == current_user["id"]
            or current_user["id"] in project.get("memberIds", [])
        ):
            raise HTTPException(status_code=403, detail="Project access denied")

    candidates_query: dict = {"role": {"$ne": "ADMIN"}}
    if project:
        allowed_ids = list(project.get("memberIds", []))
        if project.get("leadId"):
            allowed_ids.append(project["leadId"])
        candidates_query["id"] = {"$in": allowed_ids}
    elif current_user.get("role") != "ADMIN":
        candidates_query["teamId"] = current_user.get("teamId")

    candidates = await db.users.find(candidates_query).to_list(1000)
    by_id = {candidate["id"]: candidate for candidate in candidates}
    if task_data.assigneeId:
        assignee = by_id.get(task_data.assigneeId)
        if not assignee:
            raise HTTPException(
                status_code=400,
                detail="Assignee does not exist or is outside your assignment scope",
            )
    else:
        required = set(task_data.requiredSkills or [])
        eligible = [
            candidate
            for candidate in candidates
            if not required or required.intersection(candidate.get("skills", []))
        ]
        if not eligible:
            raise HTTPException(status_code=400, detail="No suitable assignee found")

        def score(candidate: dict) -> float:
            skills = set(candidate.get("skills", []))
            coverage = len(skills.intersection(required)) / len(required) if required else 1
            active_count = candidate.get("activeTaskCount", 0)
            return (
                coverage * 0.4
                + candidate.get("reliabilityScore", 0.5) * 0.4
                + max(0, 1 - active_count / 5) * 0.2
                + (0.1 if candidate.get("role") == "ASSIGNEE" else 0)
            )

        for candidate in eligible:
            candidate["activeTaskCount"] = await db.tasks.count_documents(
                {
                    "assigneeId": candidate["id"],
                    "status": {"$in": ["CREATED", "IN_PROGRESS"]},
                }
            )
        eligible.sort(key=score, reverse=True)
        assignee = eligible[0]

    now = datetime.utcnow()
    new_task = Task(
        id=f"TASK-{int(now.timestamp() * 1000)}",
        title=task_data.title,
        description=task_data.description,
        status="CREATED",
        priority=task_data.priority,
        deadline=task_data.deadline,
        startDate=task_data.startDate,
        estimatedDuration=task_data.estimatedDuration,
        dependencies=task_data.dependencies,
        assigneeId=assignee["id"],
        teamId=assignee.get("teamId") or task_data.teamId,
        deptId=assignee.get("deptId") or task_data.deptId,
        orgId=task_data.orgId,
        projectId=task_data.projectId,
        requiredSkills=task_data.requiredSkills,
        riskScore=0,
        lastAction="NONE",
    )
    await db.tasks.insert_one(new_task.model_dump())
    return new_task


@router.put("/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    task_update: TaskUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    updates = task_update.model_dump(exclude_unset=True, exclude_none=True)
    if current_user.get("role") not in MANAGER_ROLES:
        if task.get("assigneeId") != current_user["id"] or set(updates) - {"status"}:
            raise HTTPException(status_code=403, detail="Task update denied")
        if updates.get("status") not in {"IN_PROGRESS", "SUBMITTED"}:
            raise HTTPException(status_code=400, detail="Invalid assignee status transition")
    elif not await can_manage_task(db, task, current_user):
        raise HTTPException(status_code=403, detail="Task update denied")

    if updates.get("status") == "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail="Use the task completion endpoint to complete a task",
        )

    if "assigneeId" in updates:
        assignee = await db.users.find_one(
            {"id": updates["assigneeId"], "role": {"$ne": "ADMIN"}}
        )
        if not assignee:
            raise HTTPException(status_code=400, detail="Assignee does not exist")
        if current_user.get("role") != "ADMIN":
            if task.get("projectId"):
                project = await db.projects.find_one({"id": task["projectId"]})
                allowed_ids = set(project.get("memberIds", [])) if project else set()
                if project and project.get("leadId"):
                    allowed_ids.add(project["leadId"])
                in_scope = assignee["id"] in allowed_ids
            else:
                in_scope = assignee.get("teamId") == task.get("teamId")
            if not in_scope:
                raise HTTPException(
                    status_code=400,
                    detail="Assignee is outside the task's team or project scope",
                )
    updates["updatedAt"] = datetime.utcnow()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    return await db.tasks.find_one({"id": task_id})


@router.put("/{task_id}/status", response_model=Task)
async def update_task_status(
    task_id: str,
    new_status: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    if task.get("assigneeId") != current_user["id"] and not await can_manage_task(
        db, task, current_user
    ):
        raise HTTPException(status_code=403, detail="Task status update denied")
    if new_status not in {
        "CREATED", "IN_PROGRESS", "SUBMITTED", "AT_RISK", "OVERDUE", "ESCALATED"
    }:
        raise HTTPException(status_code=400, detail="Invalid task status")
    if current_user.get("role") not in MANAGER_ROLES and new_status not in {
        "IN_PROGRESS", "SUBMITTED"
    }:
        raise HTTPException(status_code=400, detail="Invalid assignee status transition")
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": new_status, "updatedAt": datetime.utcnow()}},
    )
    return await db.tasks.find_one({"id": task_id})


@router.put("/{task_id}/agent-state", response_model=Task)
async def update_agent_state(
    task_id: str,
    state: TaskAgentStateUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    if task.get("assigneeId") != current_user["id"] and not await can_manage_task(
        db, task, current_user
    ):
        raise HTTPException(status_code=403, detail="Task agent update denied")
    if task.get("status") in {"COMPLETED", "SUBMITTED"}:
        raise HTTPException(status_code=409, detail="Task is not monitored")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updates = {
        "riskScore": state.riskScore,
        "lastAction": state.lastAction,
        "updatedAt": now,
    }
    if state.riskScore > 60:
        updates["status"] = "AT_RISK"
    elif task.get("deadline", 0) < int(now.timestamp() * 1000):
        updates["status"] = "OVERDUE"

    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    return await db.tasks.find_one({"id": task_id})


@router.delete("/{task_id}", response_model=MessageResponse)
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    if not await can_manage_task(db, task, current_user):
        raise HTTPException(status_code=403, detail="Task deletion denied")
    await db.tasks.delete_one({"id": task_id})
    return MessageResponse(message="Task deleted successfully")


@router.post("/{task_id}/complete", response_model=Task)
async def complete_task(
    task_id: str,
    completion_data: TaskComplete,
    current_user: dict = Depends(get_current_user),
):
    from services.performance_service import record_task_completion

    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    if task.get("assigneeId") != current_user["id"] and not await can_manage_task(
        db, task, current_user
    ):
        raise HTTPException(status_code=403, detail="Task completion denied")
    if task.get("status") == "COMPLETED":
        return task
    await record_task_completion(
        db, task_id, completion_data.quality, completion_data.hoursSpent
    )
    return await db.tasks.find_one({"id": task_id})
