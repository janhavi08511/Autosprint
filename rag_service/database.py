from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from fastapi import HTTPException, status
import os
from dotenv import load_dotenv
from auth import hash_password

# Load environment variables
load_dotenv()

# MongoDB Configuration
MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME", "aeip_db")

# Global MongoDB client
mongodb_client: AsyncIOMotorClient = None
database = None

async def connect_to_mongo():
    """Connect to MongoDB"""
    global mongodb_client, database
    if not MONGODB_URI:
        raise RuntimeError("MONGODB_URI must be configured in the backend environment")
    try:
        mongodb_client = AsyncIOMotorClient(MONGODB_URI)
        database = mongodb_client[DATABASE_NAME]
        
        # Test connection
        await mongodb_client.admin.command('ping')
        print(f"Connected to MongoDB: {DATABASE_NAME}")
        
        # Create indexes for better performance
        await create_indexes()
        await migrate_legacy_users()
        await ensure_configured_admin()
        
    except ConnectionFailure as e:
        print(f"Failed to connect to MongoDB: {type(e).__name__}")
        raise


async def migrate_legacy_users():
    """Hash legacy plaintext passwords and normalize the legacy LEAD role."""
    cursor = database.users.find(
        {},
        {"id": 1, "password": 1, "password_hash": 1, "role": 1},
    )
    async for user in cursor:
        updates = {}
        unset = {}
        legacy_password = user.get("password")
        if isinstance(legacy_password, str):
            if not user.get("password_hash"):
                updates["password_hash"] = hash_password(legacy_password)
            unset["password"] = ""
        if user.get("role") == "LEAD":
            updates["role"] = "TEAM_LEAD"
        if updates or unset:
            operation = {"$set": updates}
            if unset:
                operation["$unset"] = unset
            await database.users.update_one({"_id": user["_id"]}, operation)


async def ensure_configured_admin():
    """Create a bootstrap admin only when both credentials are configured."""
    email = os.getenv("AEIP_ADMIN_EMAIL")
    password = os.getenv("AEIP_ADMIN_PASSWORD")
    if not email and not password:
        return
    if not email or not password:
        raise RuntimeError(
            "Both AEIP_ADMIN_EMAIL and AEIP_ADMIN_PASSWORD must be configured"
        )

    existing = await database.users.find_one({"email": email})
    if existing:
        return

    import secrets
    from datetime import datetime

    now = datetime.utcnow()
    await database.users.insert_one(
        {
            "id": f"USER-ADMIN-{secrets.token_hex(6)}",
            "name": "AEIP Administrator",
            "email": email,
            "role": "ADMIN",
            "teamId": "SYSTEM",
            "deptId": "SYSTEM",
            "reliabilityScore": 1.0,
            "skills": ["System Administration"],
            "password_hash": hash_password(password),
            "createdAt": now,
            "updatedAt": now,
        }
    )

async def close_mongo_connection():
    """Close MongoDB connection"""
    global mongodb_client
    if mongodb_client:
        mongodb_client.close()
        print("🔌 Closed MongoDB connection")

async def create_indexes():
    """Create database indexes for performance"""
    # Users collection indexes
    await database.users.create_index("id", unique=True)
    await database.users.create_index("email", unique=True)
    
    # Projects collection indexes
    await database.projects.create_index("id", unique=True)
    await database.projects.create_index("leadId")
    await database.projects.create_index("memberIds")
    
    # Tasks collection indexes
    await database.tasks.create_index("id", unique=True)
    await database.tasks.create_index("assigneeId")
    await database.tasks.create_index("projectId")
    await database.tasks.create_index("status")

    # Execution memories are upserted by stable ID before being loaded into FAISS.
    await database.memories.create_index("id", unique=True)
    await database.decision_traces.create_index("decisionId", unique=True)
    await database.decision_traces.create_index(
        [("taskId", 1), ("action", 1)], unique=True
    )
    await database.escalations.create_index("id", unique=True)
    await database.escalations.create_index("idempotencyKey", unique=True)
    await database.notifications.create_index("id", unique=True)
    await database.notifications.create_index("recipientUserId")
    await database.notifications.create_index("escalationId", unique=True)
    
    print("📊 Created database indexes")

def get_database():
    """Get database instance"""
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, 
            detail="Database connection not available. Please ensure MongoDB is running."
        )
    return database
