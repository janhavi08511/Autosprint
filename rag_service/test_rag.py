
import requests
import json
import sys

# Configuration
BASE_URL = "http://localhost:8000"

def run_test(name, func):
    """Helper to run a test function and print status."""
    print(f"Running Test: {name}...")
    try:
        func()
        print(f"✅ {name} PASSED")
    except AssertionError as e:
        print(f"❌ {name} FAILED: {e}")
        # We might want to continue other tests or stop
    except Exception as e:
        print(f"❌ {name} ERROR: {e}")
    print("-" * 30)

def test_health():
    """Verify service is up."""
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200, f"Health check failed: {response.status_code}"
    data = response.json()
    print(f"   Status: {data.get('status')}, Memories: {data.get('memories_count')}")

def test_init():
    """Test clearing/initializing memories."""
    # Initialize with empty list to clear
    response = requests.post(f"{BASE_URL}/init", json=[])
    assert response.status_code == 200, f"Init failed: {response.status_code}"
    
    # Verify count is 0
    health = requests.get(f"{BASE_URL}/health").json()
    assert health["memories_count"] == 0, f"Memories not cleared. Count: {health['memories_count']}"
    print("   Memories cleared successfully.")

def test_add_and_search():
    """Test adding memories and searching for them."""
    # 1. Add Memories
    memories = [
        {
            "id": "test_1",
            "text": "The quick brown fox jumps over the lazy dog.",
            "metadata": {"user_id": "user_a", "dept_id": "engineering", "timestamp": 1600000000}
        },
        {
            "id": "test_2",
            "text": "Machine learning uses neural networks for inference.",
            "metadata": {"user_id": "user_b", "dept_id": "research", "timestamp": 1600000001}
        },
        {
            "id": "test_3",
            "text": "Foxes are wild animals often found in forests.",
            "metadata": {"user_id": "user_a", "dept_id": "research", "timestamp": 1600000002}
        }
    ]
    
    print("   Adding 3 memories...")
    for mem in memories:
        resp = requests.post(f"{BASE_URL}/add", json=mem)
        assert resp.status_code == 200, f"Failed to add {mem['id']}: {resp.text}"

    # 2. Search Basic
    query_text = "brown fox"
    print(f"   Searching for: '{query_text}'")
    search_payload = {"text": query_text, "top_k": 5}
    resp = requests.post(f"{BASE_URL}/search", json=search_payload)
    results = resp.json()
    
    # Should find test_1 and test_3
    ids = [r['id'] for r in results]
    print(f"   Found IDs: {ids}")
    assert "test_1" in ids, "Expected test_1 in results"
    assert "test_3" in ids, "Expected test_3 in results"

    # 3. Search with Filter (user_id)
    print("   Searching with filter (user_id='user_b')...")
    search_payload_user = {"text": "neural networks", "top_k": 5, "filter_user_id": "user_b"}
    resp = requests.post(f"{BASE_URL}/search", json=search_payload_user)
    results = resp.json()
    ids = [r['id'] for r in results]
    print(f"   Found IDs: {ids}")
    assert "test_2" in ids, "Expected test_2"
    assert "test_1" not in ids, "Did not expect test_1 (wrong user)"

    # 4. Search with Filter (dept_id)
    print("   Searching with filter (dept_id='research')...")
    search_payload_dept = {"text": "animals", "top_k": 5, "filter_dept_id": "research"}
    resp = requests.post(f"{BASE_URL}/search", json=search_payload_dept)
    results = resp.json()
    ids = [r['id'] for r in results]
    print(f"   Found IDs: {ids}")
    assert "test_3" in ids, "Expected test_3"
    assert "test_2" in ids, "Expected test_2" # Also in research
    assert "test_1" not in ids, "Did not expect test_1 (engineering)"

if __name__ == "__main__":
    print(f"🔗 Connecting to RAG Service at {BASE_URL}")
    run_test("Health Check", test_health)
    run_test("Initialization (Clear)", test_init)
    run_test("Add & Search Workflow", test_add_and_search)
