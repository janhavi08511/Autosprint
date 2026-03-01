import asyncio
from datetime import datetime
from database import connect_to_mongo, close_mongo_connection, get_database

async def main():
    try:
        await connect_to_mongo()
        db = get_database()
        
        # Default values for missing fields
        defaults = {
            "teamId": "UNASSIGNED",
            "deptId": "UNASSIGNED",
            "reliabilityScore": 0.5,
            "password": "password123", 
            "skills": ["General"],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }

        # Find users with missing critical fields and update them
        # We check for 'teamId' as a proxy for the missing block of fields
        users = await db.users.find({"teamId": {"$exists": False}}).to_list(100)
        print(f"Found {len(users)} incomplete users.")
        
        for user in users:
            print(f"Fixing user: {user.get('id', 'UNKNOWN')}")
            # Only set fields that are missing
            update_data = {}
            for key, val in defaults.items():
                if key not in user:
                    update_data[key] = val
            
            if update_data:
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": update_data}
                )
        
        print("✅ User data repair complete.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
