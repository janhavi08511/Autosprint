import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_api():
    print("🔍 Starting Backend Verification...")
    
    # 1. Health/Users Check
    try:
        print("   Checking /api/users/...")
        res = requests.get(f"{BASE_URL}/api/users/")
        if res.status_code == 200:
            users = res.json()
            print(f"   ✅ Users endpoint is healthy. Found {len(users)} users.")
        else:
            print(f"   ❌ Users endpoint failed: {res.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")
        return False

    # 2. Tasks Check
    try:
        print("   Checking /api/tasks/...")
        res = requests.get(f"{BASE_URL}/api/tasks/")
        if res.status_code == 200:
            tasks = res.json()
            print(f"   ✅ Tasks endpoint is healthy. Found {len(tasks)} tasks.")
            
            # 3. Critical Path Check (Gantt Logic)
            if tasks:
                print("   Checking /gantt/critical-path...")
                # We need to send tasks in the body as per the endpoint definition
                # The endpoint expects a list of tasks
                gantt_res = requests.post(f"{BASE_URL}/gantt/critical-path", json=tasks)
                
                if gantt_res.status_code == 200:
                    cp_data = gantt_res.json()
                    print(f"   ✅ Gantt Analysis successful.")
                    print(f"      Critical Path Analysis Result: {cp_data}")
                else:
                    print(f"   ❌ Gantt endpoint failed: {gantt_res.status_code}")
                    print(f"      Response: {gantt_res.text}")
            else:
                print("   ⚠️ No tasks found to test Gantt logic.")

    except Exception as e:
        print(f"   ❌ Tasks check failed: {e}")
        return False

    return True

if __name__ == "__main__":
    if test_api():
        print("\n🚀 Backend System is OPERATIONAL")
        sys.exit(0)
    else:
        print("\n💥 Backend Verification FAILED")
        sys.exit(1)
