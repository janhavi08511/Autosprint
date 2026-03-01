from fastapi import APIRouter, HTTPException, status
from typing import List
from datetime import datetime
from models import User, UserCreate, UserLogin, UserUpdate, MessageResponse
from database import get_database

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/", response_model=List[User])
async def get_all_users():
    """Get all users"""
    db = get_database()
    users = await db.users.find().to_list(1000)
    return users

@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str):
    """Get user by ID"""
    db = get_database()
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate):
    """Register a new user"""
    db = get_database()
    
    # Check if email already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    user_id = f"USER-{int(datetime.utcnow().timestamp() * 1000)}"
    new_user = User(
        id=user_id,
        name=user_data.name,
        email=user_data.email,
        password=user_data.password,  # TODO: Hash password in production
        role=user_data.role,
        teamId="UNASSIGNED",
        deptId="UNASSIGNED",
        reliabilityScore=0.5,  # Start neutral
        skills=user_data.skills if user_data.skills else ["General"]
    )
    
    await db.users.insert_one(new_user.model_dump())
    return new_user

@router.post("/login", response_model=User)
async def login_user(credentials: UserLogin):
    """Login user (mock authentication)"""
    db = get_database()
    
    # Find user by email
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check password (mock - no hashing for now)
    if user.get("password") != credentials.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return user

@router.put("/{user_id}", response_model=User)
async def update_user(user_id: str, user_update: UserUpdate):
    """Update user information"""
    db = get_database()
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    update_data["updatedAt"] = datetime.utcnow()
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    # Return updated user
    updated_user = await db.users.find_one({"id": user_id})
    return updated_user

@router.put("/{user_id}/skills", response_model=User)
async def update_user_skills(user_id: str, skills: List[str]):
    """Update user skills"""
    db = get_database()
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update skills
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"skills": skills, "updatedAt": datetime.utcnow()}}
    )
    
    # Return updated user
    updated_user = await db.users.find_one({"id": user_id})
    return updated_user

@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(user_id: str):
    """Delete user"""
    db = get_database()
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return MessageResponse(message="User deleted successfully")
