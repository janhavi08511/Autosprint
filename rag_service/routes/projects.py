from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_current_user
from database import get_database
from models import MessageResponse, Project, ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def is_admin(user: dict) -> bool:
    return user.get("role") == "ADMIN"


def is_project_lead(project: dict, user: dict) -> bool:
    return is_admin(user) or project.get("leadId") == user["id"]


async def load_accessible_projects(db, user: dict) -> list[dict]:
    if is_admin(user):
        return await db.projects.find().to_list(1000)
    project_ids = {
        project["id"]
        for project in await db.projects.find(
            {"$or": [{"leadId": user["id"]}, {"memberIds": user["id"]}]},
            {"id": 1},
        ).to_list(1000)
    }
    assigned = await db.tasks.find(
        {"assigneeId": user["id"], "projectId": {"$ne": None}},
        {"projectId": 1},
    ).to_list(1000)
    project_ids.update(
        task["projectId"] for task in assigned if task.get("projectId")
    )
    if not project_ids:
        return []
    return await db.projects.find({"id": {"$in": list(project_ids)}}).to_list(1000)


async def require_project_access(db, project_id: str, user: dict) -> dict:
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_admin(user) or project.get("leadId") == user["id"]:
        return project
    if user["id"] in project.get("memberIds", []):
        return project
    task = await db.tasks.find_one({"projectId": project_id, "assigneeId": user["id"]})
    if task:
        return project
    raise HTTPException(status_code=403, detail="Project access denied")


@router.get("/", response_model=List[Project])
async def get_all_projects(current_user: dict = Depends(get_current_user)):
    return await load_accessible_projects(get_database(), current_user)


@router.get("/{project_id}", response_model=Project)
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await require_project_access(get_database(), project_id, current_user)


@router.post("/", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in {"ADMIN", "TEAM_LEAD", "MANAGER"}:
        raise HTTPException(status_code=403, detail="Project creation denied")
    db = get_database()
    lead_id = current_user["id"] if current_user["role"] != "ADMIN" else None
    project_id = f"PROJ-{int(datetime.utcnow().timestamp() * 1000)}"
    new_project = Project(
        id=project_id,
        name=project_data.name,
        description=project_data.description,
        orgId=project_data.orgId,
        leadId=lead_id,
        memberIds=[],
        status="ACTIVE",
    )
    await db.projects.insert_one(new_project.model_dump())
    return new_project


@router.put("/{project_id}", response_model=Project)
async def update_project(
    project_id: str,
    project_update: ProjectUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    project = await require_project_access(db, project_id, current_user)
    if not is_project_lead(project, current_user):
        raise HTTPException(status_code=403, detail="Project update denied")

    updates = project_update.model_dump(exclude_unset=True, exclude_none=True)
    new_lead_id = updates.get("leadId")
    if new_lead_id:
        new_lead = await db.users.find_one({"id": new_lead_id})
        if not new_lead or new_lead.get("role") not in {"TEAM_LEAD", "MANAGER"}:
            raise HTTPException(status_code=400, detail="Lead must be a team lead or manager")
    updates["updatedAt"] = datetime.utcnow()
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return await db.projects.find_one({"id": project_id})


@router.post("/{project_id}/members/{user_id}", response_model=Project)
async def add_member(
    project_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    project = await require_project_access(db, project_id, current_user)
    if not is_project_lead(project, current_user):
        raise HTTPException(status_code=403, detail="Project membership management denied")
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("role") == "ADMIN":
        raise HTTPException(status_code=404, detail="Assignable user not found")
    await db.projects.update_one(
        {"id": project_id},
        {
            "$addToSet": {"memberIds": user_id},
            "$set": {"updatedAt": datetime.utcnow()},
        },
    )
    return await db.projects.find_one({"id": project_id})


@router.delete("/{project_id}/members/{user_id}", response_model=Project)
async def remove_member(
    project_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    project = await require_project_access(db, project_id, current_user)
    if not is_project_lead(project, current_user):
        raise HTTPException(status_code=403, detail="Project membership management denied")
    await db.projects.update_one(
        {"id": project_id},
        {
            "$pull": {"memberIds": user_id},
            "$set": {"updatedAt": datetime.utcnow()},
        },
    )
    return await db.projects.find_one({"id": project_id})


@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    project = await require_project_access(db, project_id, current_user)
    if not is_project_lead(project, current_user):
        raise HTTPException(status_code=403, detail="Project deletion denied")
    await db.projects.delete_one({"id": project_id})
    return MessageResponse(message="Project deleted successfully")
