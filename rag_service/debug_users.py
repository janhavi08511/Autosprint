import asyncio
from database import connect_to_mongo, close_mongo_connection, get_database

async def main():
    try:
        await connect_to_mongo()
        db = get_database()
        print("Fetching users...")
        users = await db.users.find().to_list(10)
        print(f"Found {len(users)} users.")
        for u in users:
            print(f"User ID: {u.get('id')}")
            print(f"Keys: {list(u.keys())}")
            # Check for required fields
            required = ["id", "name", "email", "role", "teamId", "deptId", "reliabilityScore", "password", "createdAt", "updatedAt"]
            missing = [f for f in required if f not in u]
            if missing:
                print(f"⚠️ MISSING FIELDS: {missing}")
            else:
                print("✅ All required fields present")
            print("-" * 20)
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
