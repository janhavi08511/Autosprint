from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from database import get_database
from models import AuthResponse, MessageResponse, UserCreate, UserLogin, UserPublic, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def public_user(user: dict) -> UserPublic:
    return UserPublic.model_validate(user)


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: dict = Depends(get_current_user)):
    return public_user(current_user)


@router.get("/assignable", response_model=List[UserPublic])
async def get_assignable_users(
    project_id: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    role = current_user.get("role")
    query: dict = {"role": {"$ne": "ADMIN"}}

    if role == "ADMIN":
        pass
    elif role in {"TEAM_LEAD", "MANAGER"}:
        query["teamId"] = current_user.get("teamId")
        query["role"] = {"$in": ["ASSIGNEE", "TEAM_LEAD", "MANAGER"]}
        if project_id:
            project = await db.projects.find_one({"id": project_id})
            if not project or not (
                project.get("leadId") == current_user["id"]
                or current_user["id"] in project.get("memberIds", [])
            ):
                raise HTTPException(status_code=403, detail="Project access denied")
            allowed_ids = list(project.get("memberIds", []))
            if project.get("leadId"):
                allowed_ids.append(project["leadId"])
            query["id"] = {"$in": allowed_ids}
    else:
        query["teamId"] = current_user.get("teamId")
        query["role"] = {"$in": ["ASSIGNEE", "TEAM_LEAD", "MANAGER"]}

    users = await db.users.find(query).to_list(1000)
    return [public_user(user) for user in users]


@router.get("/", response_model=List[UserPublic])
async def get_all_users(
    _: dict = Depends(require_roles("ADMIN")),
):
    users = await get_database().users.find().to_list(1000)
    return [public_user(user) for user in users]


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "ADMIN" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="User access denied")
    user = await get_database().users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(user)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    if user_data.role != "ASSIGNEE":
        raise HTTPException(
            status_code=403,
            detail="Public registration is limited to the ASSIGNEE role",
        )
    db = get_database()
    if await db.users.find_one({"email": user_data.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    now = datetime.utcnow()
    user_id = f"USER-{int(now.timestamp() * 1000)}"
    user = {
        "id": user_id,
        "name": user_data.name,
        "email": user_data.email,
        "role": "ASSIGNEE",
        "teamId": "UNASSIGNED",
        "deptId": "UNASSIGNED",
        "reliabilityScore": 0.5,
        "skills": user_data.skills or ["General"],
        "password_hash": hash_password(user_data.password),
        "createdAt": now,
        "updatedAt": now,
    }
    await db.users.insert_one(user)
    return AuthResponse(access_token=create_access_token(user_id), user=public_user(user))


@router.post("/login", response_model=AuthResponse)
async def login_user(credentials: UserLogin):
    db = get_database()
    user = await db.users.find_one({"email": credentials.email})
    stored_hash = user.get("password_hash") if user else None
    legacy_password = user.get("password") if user else None
    password_valid = bool(
        user
        and (
            (stored_hash and verify_password(credentials.password, stored_hash))
            or (legacy_password and hmac_compare(credentials.password, legacy_password))
        )
    )
    if not password_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if legacy_password and not stored_hash:
        await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {"password_hash": hash_password(credentials.password)},
                "$unset": {"password": ""},
            },
        )
        user.pop("password", None)

    if user.get("role") == "LEAD":
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"role": "TEAM_LEAD"}})
        user["role"] = "TEAM_LEAD"
    return AuthResponse(access_token=create_access_token(user["id"]), user=public_user(user))


def hmac_compare(candidate: str, stored: str) -> bool:
    import hmac

    return hmac.compare_digest(candidate.encode("utf-8"), stored.encode("utf-8"))


@router.put("/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "ADMIN" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="User update denied")
    db = get_database()
    update_data = {
        key: value
        for key, value in user_update.model_dump(exclude_unset=True).items()
        if value is not None
    }
    if current_user.get("role") != "ADMIN":
        update_data.pop("reliabilityScore", None)
        update_data.pop("teamId", None)
        update_data.pop("deptId", None)
    update_data["updatedAt"] = datetime.utcnow()
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(await db.users.find_one({"id": user_id}))


@router.put("/{user_id}/skills", response_model=UserPublic)
async def update_user_skills(
    user_id: str,
    skills: List[str],
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "ADMIN" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Skill update denied")
    db = get_database()
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"skills": skills, "updatedAt": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(await db.users.find_one({"id": user_id}))


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: str,
    _: dict = Depends(require_roles("ADMIN")),
):
    result = await get_database().users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return MessageResponse(message="User deleted successfully")
