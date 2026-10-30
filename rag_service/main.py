import faiss
import numpy as np
import uvicorn
import sys
import os
from pydantic import ConfigDict, Field
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from sentence_transformers import SentenceTransformer
from fastapi.middleware.cors import CORSMiddleware
from auth import get_current_user
from fastapi import Depends

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# --- Configuration ---
MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'
EMBEDDING_DIM = 384

# --- Data Models ---
class MemoryMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: Optional[str] = None
    dept_id: Optional[str] = None
    task_type: Optional[str] = None
    decision_id: Optional[str] = None
    timestamp: Optional[int] = None

class Memory(BaseModel):
    id: str
    text: str
    metadata: MemoryMetadata

class SearchQuery(BaseModel):
    text: str
    top_k: int = Field(default=3, ge=1, le=100)
    filter_user_id: Optional[str] = None
    filter_dept_id: Optional[str] = None

class SearchResult(BaseModel):
    id: str
    text: str
    score: float
    metadata: MemoryMetadata

# --- Global State ---
app = FastAPI(title="AEIP RAG Microservice")

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global stores
# FAISS Index (Inner Product for Cosine Similarity on normalized vectors)
index = faiss.IndexFlatIP(EMBEDDING_DIM)
# Map FAISS internal int ID -> Memory ID (str)
id_map: List[str] = []
# Map Memory ID (str) -> Memory Object
memory_store: Dict[str, Memory] = {}

# Load Model (Global Singleton)
print("Loading Embedding Model...")
model = SentenceTransformer(MODEL_NAME)
print("Model Loaded.")

# --- Helper Functions ---
def get_embedding(text: str) -> np.ndarray:
    # Encode and normalize for cosine similarity
    vec = model.encode([text])[0]
    vec_np = vec.astype('float32').reshape(1, -1)
    faiss.normalize_L2(vec_np)  # Modifies in-place
    return vec_np[0]  # Return flattened vector

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok", "memories_count": index.ntotal}

@app.post("/add")
async def add_memory(
    memory: Memory,
    _: dict = Depends(get_current_user),
):
    await get_database().memories.replace_one(
        {"id": memory.id},
        memory.model_dump(),
        upsert=True,
    )
    upsert_memories([memory])
    return {"status": "added", "id": memory.id}

@app.post("/init")
async def init_memories(
    memories: List[Memory],
    _: dict = Depends(get_current_user),
):
    """Persist and seed memories without clearing learned records."""
    if not memories:
        return {"status": "unchanged", "count": index.ntotal}
    collection = get_database().memories
    for memory in memories:
        await collection.replace_one(
            {"id": memory.id},
            memory.model_dump(),
            upsert=True,
        )
    upsert_memories(memories)
    return {"status": "initialized", "count": len(memories)}

@app.post("/search", response_model=List[SearchResult])
def search_memories(
    query: SearchQuery,
    _: dict = Depends(get_current_user),
):
    if index.ntotal == 0:
        return []

    # 1. Embed Query
    q_vec = get_embedding(query.text)
    q_np = np.array([q_vec]).astype('float32')
    
    # 2. Search (fetch more than needed to allow for filtering)
    # Fetch 5x top_k to ensure we have enough candidates after filtering
    k_search = min(query.top_k * 5, index.ntotal)
    distances, indices = index.search(q_np, k_search)
    
    results = []
    
    for i, idx in enumerate(indices[0]):
        if idx == -1: continue
        
        mem_id = id_map[idx]
        memory = memory_store.get(mem_id)
        
        if not memory:
            continue
            
        # 3. Apply Filters
        if query.filter_user_id and memory.metadata.user_id != query.filter_user_id:
            continue
            
        if query.filter_dept_id and memory.metadata.dept_id != query.filter_dept_id:
            continue
            
        results.append(SearchResult(
            id=memory.id,
            text=memory.text,
            score=float(distances[0][i]),
            metadata=memory.metadata
        ))
        
        if len(results) >= query.top_k:
            break
            
    return results


def upsert_memories(memories: List[Memory]) -> None:
    """Replace records by stable ID and rebuild the in-memory vector index."""
    global index, id_map, memory_store
    for memory in memories:
        memory_store[memory.id] = memory
    id_map = list(memory_store)
    index = faiss.IndexFlatIP(EMBEDDING_DIM)
    if not id_map:
        return
    embeddings = model.encode([memory_store[memory_id].text for memory_id in id_map])
    embeddings = np.asarray(embeddings, dtype="float32")
    faiss.normalize_L2(embeddings)
    index.add(embeddings)


# ===== MongoDB Integration =====
# Import routes
from database import connect_to_mongo, close_mongo_connection, get_database
from routes import users, projects, tasks, gantt, explanations, decisions

# Register API Routes
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(gantt.router, prefix="/gantt", tags=["Gantt"])
app.include_router(explanations.router)
app.include_router(decisions.router)

# Startup and Shutdown Events
@app.on_event("startup")
async def startup_event():
    """Initialize MongoDB connection on startup"""
    try:
        await connect_to_mongo()
        records = await get_database().memories.find().to_list(10000)
        if records:
            upsert_memories([Memory.model_validate(record) for record in records])
        print("🚀 AEIP Backend with MongoDB started successfully")
    except Exception as e:
        print(f"MongoDB initialization failed: {type(e).__name__}")
        print("RAG service will continue without MongoDB")

@app.on_event("shutdown")
async def shutdown_event():
    """Close MongoDB connection on shutdown"""
    await close_mongo_connection()
    print("👋 AEIP Backend shutdown complete")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
