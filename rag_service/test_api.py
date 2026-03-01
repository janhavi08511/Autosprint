# Test MongoDB API Endpoints

import requests
import json

BASE_URL = "http://localhost:8000"

print("🧪 Testing MongoDB API Endpoints\n")

# Test 1: Health Check
print("1️⃣ Testing Health Check...")
try:
    response = requests.get(f"{BASE_URL}/health")
    print(f"   ✅ Status: {response.status_code}")
    print(f"   📊 Response: {response.json()}\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

# Test 2: Get All Users
print("2️⃣ Testing Get All Users...")
try:
    response = requests.get(f"{BASE_URL}/api/users/")
    print(f"   ✅ Status: {response.status_code}")
    users = response.json()
    print(f"   👥 Found {len(users)} users\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

# Test 3: Register New User
print("3️⃣ Testing User Registration...")
try:
    user_data = {
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123",
        "role": "ASSIGNEE",
        "skills": ["JavaScript", "Python"]
    }
    response = requests.post(f"{BASE_URL}/api/users/register", json=user_data)
    print(f"   ✅ Status: {response.status_code}")
    if response.status_code == 200:
        user = response.json()
        print(f"   👤 Created user: {user.get('name')} ({user.get('email')})")
        print(f"   🆔 User ID: {user.get('_id')}\n")
    else:
        print(f"   ⚠️  Response: {response.text}\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

# Test 4: Login
print("4️⃣ Testing User Login...")
try:
    login_data = {
        "email": "test@example.com",
        "password": "password123"
    }
    response = requests.post(f"{BASE_URL}/api/users/login", json=login_data)
    print(f"   ✅ Status: {response.status_code}")
    if response.status_code == 200:
        user = response.json()
        print(f"   👤 Logged in as: {user.get('name')}\n")
    else:
        print(f"   ⚠️  Response: {response.text}\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

# Test 5: Get All Tasks
print("5️⃣ Testing Get All Tasks...")
try:
    response = requests.get(f"{BASE_URL}/api/tasks/")
    print(f"   ✅ Status: {response.status_code}")
    tasks = response.json()
    print(f"   📋 Found {len(tasks)} tasks\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

# Test 6: Get All Projects
print("6️⃣ Testing Get All Projects...")
try:
    response = requests.get(f"{BASE_URL}/api/projects/")
    print(f"   ✅ Status: {response.status_code}")
    projects = response.json()
    print(f"   📁 Found {len(projects)} projects\n")
except Exception as e:
    print(f"   ❌ Error: {e}\n")

print("✅ API Testing Complete!")
