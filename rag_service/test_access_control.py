import asyncio
import httpx
from database import connect_to_mongo, close_mongo_connection, get_database

BASE_URL = "http://localhost:8000"

async def setup_test_data():
    db = get_database()
    
    # Clear collections
    await db.users.delete_many({})
    await db.projects.delete_many({})
    await db.tasks.delete_many({})
    
    # 1. Create Users
    users = [
        {"id": "USER-A", "name": "User A (Creator)", "email": "a@test.com", "role": "LEAD"},
        {"id": "USER-B", "name": "User B (Member)", "email": "b@test.com", "role": "ASSIGNEE"},
        {"id": "USER-C", "name": "User C (Contributor)", "email": "c@test.com", "role": "ASSIGNEE"},
        {"id": "USER-D", "name": "User D (Outsider)", "email": "d@test.com", "role": "ASSIGNEE"},
    ]
    await db.users.insert_many(users)
    
    # 2. Create Project P (Lead: A, Member: B)
    project = {
        "id": "PROJ-P",
        "name": "Project P",
        "description": "Secret Project",
        "orgId": "ORG-1",
        "leadId": "USER-A",
        "memberIds": ["USER-B"],
        "status": "ACTIVE"
    }
    await db.projects.insert_one(project)
    
    # 3. Create Tasks
    tasks = [
        # Task T1 in P assigned to C (making C a contributor)
        {
            "id": "TASK-T1", "title": "Task 1", "description": "Desc 1", "status": "CREATED", "priority": "HIGH", 
            "deadline": 1000, "assigneeId": "USER-C", "projectId": "PROJ-P", "teamId": "T1", "deptId": "D1", "orgId": "ORG-1"
        },
        # Task T2 in P assigned to A (Creator)
        {
            "id": "TASK-T2", "title": "Task 2", "description": "Desc 2", "status": "CREATED", "priority": "HIGH", 
            "deadline": 1000, "assigneeId": "USER-A", "projectId": "PROJ-P", "teamId": "T1", "deptId": "D1", "orgId": "ORG-1"
        }
    ]
    await db.tasks.insert_many(tasks)
    
    print("✅ Test data setup complete")

async def test_access_control():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        
        # Scenario 1: User A (Creator) fetches projects
        # Expect: [PROJ-P]
        resp = await client.get("/api/projects/", params={"user_id": "USER-A"})
        projects = resp.json()
        assert len(projects) == 1
        assert projects[0]["id"] == "PROJ-P"
        print("✅ User A (Creator) sees Project P")
        
        # Scenario 2: User B (Member) fetches projects
        # Expect: [PROJ-P]
        resp = await client.get("/api/projects/", params={"user_id": "USER-B"})
        projects = resp.json()
        assert len(projects) == 1
        assert projects[0]["id"] == "PROJ-P"
        print("✅ User B (Member) sees Project P")
        
        # Scenario 3: User C (Contributor via Task) fetches projects
        # Expect: [PROJ-P]
        resp = await client.get("/api/projects/", params={"user_id": "USER-C"})
        projects = resp.json()
        assert len(projects) == 1
        assert projects[0]["id"] == "PROJ-P"
        print("✅ User C (Contributor) sees Project P")
        
        # Scenario 4: User D (Outsider) fetches projects
        # Expect: []
        resp = await client.get("/api/projects/", params={"user_id": "USER-D"})
        projects = resp.json()
        assert len(projects) == 0
        print("✅ User D (Outsider) sees NO projects")
        
        # Scenario 5: User C fetches tasks for Project P
        # Expect: Can see tasks because C is contributor
        resp = await client.get("/api/tasks/", params={"user_id": "USER-C", "project_id": "PROJ-P"})
        tasks = resp.json()
        assert len(tasks) > 0 # Should see tasks in the project
        print("✅ User C (Contributor) can fetch tasks for Project P")
        
        # Scenario 6: User D fetches tasks for Project P
        # Expect: Access Denied (Empty list)
        resp = await client.get("/api/tasks/", params={"user_id": "USER-D", "project_id": "PROJ-P"})
        tasks = resp.json()
        assert len(tasks) == 0
        print("✅ User D (Outsider) CANNOT fetch tasks for Project P")
        
        # Scenario 7: User C fetches ALL tasks
        # Expect: Only assigned tasks or tasks in projects they own (T1)
        resp = await client.get("/api/tasks/", params={"user_id": "USER-C"})
        if resp.status_code != 200:
            print(f"❌ Error in Scenario 7: Status={resp.status_code}, Body={resp.text}")
        tasks = resp.json()
        task_ids = [t["id"] for t in tasks]
        assert "TASK-T1" in task_ids
        assert "TASK-T2" not in task_ids
        print("✅ User C sees only their assigned tasks (T1) in global view")
        
        # Scenario 8: User A fetches ALL tasks
        # Expect: T1 and T2 (A is Lead of P, so sees all tasks in P)
        resp = await client.get("/api/tasks/", params={"user_id": "USER-A"})
        if resp.status_code != 200:
             print(f"❌ Error in Scenario 8: Status={resp.status_code}, Body={resp.text}")
        tasks = resp.json()
        assert len(tasks) >= 2
        print("✅ User A (Lead) sees all tasks in Project P")

async def main():
    await connect_to_mongo()
    try:
        await setup_test_data()
        await test_access_control()
        print("🚀 All Access Control Tests Passed!")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
