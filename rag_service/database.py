from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from fastapi import HTTPException, status
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB Configuration
MONGODB_URI ='mongodb+srv://janhavi08511:jkp%2347@cluster0.a1hn6bf.mongodb.net/'
DATABASE_NAME = os.getenv("DATABASE_NAME", "aeip_db")

# Global MongoDB client
mongodb_client: AsyncIOMotorClient = None
database = None

async def connect_to_mongo():
    """Connect to MongoDB"""
    global mongodb_client, database
    try:
        mongodb_client = AsyncIOMotorClient(MONGODB_URI)
        database = mongodb_client[DATABASE_NAME]
        
        # Test connection
        await mongodb_client.admin.command('ping')
        print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
        
        # Create indexes for better performance
        await create_indexes()
        
    except ConnectionFailure as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise

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
    
    print("📊 Created database indexes")

def get_database():
    """Get database instance"""
    if database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, 
            detail="Database connection not available. Please ensure MongoDB is running."
        )
    return database
