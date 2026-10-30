<div align="center">
</div>

# AEIC – Agentic Execution Intelligence Coordinator

**AI-driven execution intelligence platform for autonomous deadline-driven workflow management**

## Quick Start

> 📖 **For detailed step-by-step instructions, see [RUN_GUIDE.md](RUN_GUIDE.md)**

### Prerequisites
- **Node.js** (v18+)
- **Python 3.10+** (for the FastAPI service)
- **MongoDB** (required for authentication and workspace data)
- **Gemini API Key** (optional; configure on the backend only)

### Quick Setup (TL;DR)

**Terminal 1 - RAG Service:**
```bash
cd rag_service
pip install -r requirements.txt
# Copy ../.env.example to .env in this folder and configure the values.
python main.py
```

**Terminal 2 - Frontend:**
```bash
npm install
npm run dev
```

**Browser:** Open `http://localhost:3000`
Register an account to get started. Public registration creates an assignee account; configure
`AEIP_ADMIN_EMAIL` and `AEIP_ADMIN_PASSWORD` in the backend environment to bootstrap an administrator.

### Detailed Setup Instructions

1. **Install Frontend Dependencies**
   ```bash
   npm install
   ```

2. **Configure Backend Environment Variables**
   Copy `.env.example` to `rag_service/.env`, then set the MongoDB URI and a unique signing secret.
   Set `GEMINI_API_KEY` only if you want generated explanations; it is never sent to the browser.

3. **Start the Backend Service**
   ```bash
   cd rag_service
   pip install -r requirements.txt
   python main.py
   ```
   The service will run on `http://localhost:8000`

4. **Start the React Application**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

## Features

- ✅ **Autonomous Task Monitoring** - AI agent continuously monitors tasks every 15 seconds
- ✅ **RAG-Based Context Retrieval** - Historical execution memories are retrieved for decision explanations; they do not change the deterministic risk score
- ✅ **SLM-First Reasoning** - Cost-optimized deterministic risk calculation
- ✅ **LLM Explainability** - Natural language explanations for AI decisions
- ✅ **Hierarchical Escalation** - Multi-level escalation path (Assignee → Team Lead → Manager → Admin)
- ✅ **Execution Memory** - Escalation context is stored for later retrieval and explanation
- ✅ **Decision Trace Panel** - Transparent view of AI reasoning process

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS
- **API and authentication**: FastAPI with MongoDB-backed users, projects, and tasks; signed bearer tokens
- **AI Reasoning**: Deterministic SLM logic + optional server-proxied Gemini LLM
- **Vector Search**: FAISS (Python microservice with Sentence Transformers)
- **Persistence**: MongoDB stores users, tasks, projects, execution memories, decision traces, escalations, and recipient notifications; localStorage holds the browser token and cached profile.

## Usage

1. **Login** - Register an assignee account or sign in with provisioned credentials
2. **Create Tasks** - Use the "Delegate New Workflow" form (available to Admins/Team Leads)
3. **Monitor Execution** - Watch tasks in the "Operational Monitor" table
4. **View AI Decisions** - Click on any task to see the Decision Trace panel showing:
   - RAG Memory Recall (historical context)
   - Deterministic risk/action and the persisted escalation path
   - Gemini explanation or an explicitly labeled unavailable/local fallback
   - Correlated escalation, notification delivery, and execution-memory status
5. **Handle Escalations** - The recipient sees their notifications in the inbox and can acknowledge, then resolve them. The current implementation routes each escalation to the next role and does not deliver external messages.

## Project Structure

```
├── App.tsx              # Main application component
├── agentService.ts      # Autonomous monitoring agent loop
├── reasoningEngine.ts   # SLM-first deterministic reasoning
├── vectorStore.ts       # RAG retrieval interface
├── geminiService.ts     # LLM explanation generation
├── ProjectManager.tsx   # Project management UI
├── rag_service/         # Python FAISS microservice
│   ├── main.py         # FastAPI service with FAISS
│   └── requirements.txt
└── types.ts            # TypeScript type definitions
```

## Notes

- RAG retrieval falls back to local heuristics if the vector search service is unavailable
- The backend requires MongoDB; the frontend does not use mock credentials
- MCP is not implemented; the application uses ordinary authenticated API calls and structured context.
- The system uses synthetic/mock data for demonstration purposes

## View in AI Studio

Original AI Studio link: https://ai.studio/apps/temp/1
