from fastapi import APIRouter, HTTPException, status
from typing import List
from datetime import datetime
from models import Project, ProjectCreate, ProjectUpdate, MessageResponse
from database import get_database

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("/", response_model=List[Project])
async def get_all_projects(user_id: str = None):
    """Get all projects, filtered by user access (Lead, Member, or Assigned Task)"""
    db = get_database()
    
    if not user_id:
        # Return empty if no user specified (secure by default)
        return []

    # 1. Direct Access (Lead or Member)
    # Find IDs of projects where user is lead or member
    direct_projects = await db.projects.find({
        "$or": [
            {"leadId": user_id},
            {"memberIds": user_id}
        ]
    }, {"id": 1}).to_list(1000)
    
    project_ids = {p["id"] for p in direct_projects}

    # 2. Task Access (Assigned to a task in the project)
    # Find all tasks assigned to this user that belong to a project
    user_tasks = await db.tasks.find({
        "assigneeId": user_id, 
        "projectId": {"$ne": None}
    }, {"projectId": 1}).to_list(1000)
    
    for task in user_tasks:
        if task.get("projectId"):
            project_ids.add(task["projectId"])

    # 3. Fetch unique projects
    if not project_ids:
        return []
        
    all_projects = await db.projects.find({"id": {"$in": list(project_ids)}}).to_list(1000)
    return all_projects

@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str):
    """Get project by ID"""
    db = get_database()
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(project_data: ProjectCreate, lead_id: str = None):
    """Create a new project"""
    db = get_database()
    
    # Create new project
    project_id = f"PROJ-{int(datetime.utcnow().timestamp() * 1000)}"
    new_project = Project(
        id=project_id,
        name=project_data.name,
        description=project_data.description,
        orgId=project_data.orgId,
        leadId=lead_id,  # Can be None initially
        memberIds=[],
        status="ACTIVE"
    )
    
    await db.projects.insert_one(new_project.model_dump())
    return new_project

@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, project_update: ProjectUpdate):
    """Update project information"""
    db = get_database()
    
    # Check if project exists
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update fields
    update_data = {k: v for k, v in project_update.model_dump().items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow()
    
    await db.projects.update_one(
        {"id": project_id},
        {"$set": update_data}
    )
    
    # Return updated project
    updated_project = await db.projects.find_one({"id": project_id})
    return updated_project

@router.post("/{project_id}/members/{user_id}", response_model=Project)
async def add_member(project_id: str, user_id: str):
    """Add a member to the project"""
    db = get_database()
    
    # Check if project exists
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Add member if not already in list
    if user_id not in project.get("memberIds", []):
        await db.projects.update_one(
            {"id": project_id},
            {
                "$push": {"memberIds": user_id},
                "$set": {"updatedAt": datetime.utcnow()}
            }
        )
    
    # Return updated project
    updated_project = await db.projects.find_one({"id": project_id})
    return updated_project

@router.delete("/{project_id}/members/{user_id}", response_model=Project)
async def remove_member(project_id: str, user_id: str):
    """Remove a member from the project"""
    db = get_database()
    
    # Check if project exists
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Remove member
    await db.projects.update_one(
        {"id": project_id},
        {
            "$pull": {"memberIds": user_id},
            "$set": {"updatedAt": datetime.utcnow()}
        }
    )
    
    # Return updated project
    updated_project = await db.projects.find_one({"id": project_id})
    return updated_project

@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(project_id: str):
    """Delete project"""
    db = get_database()
    
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return MessageResponse(message="Project deleted successfully")
