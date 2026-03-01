<div align="center">
</div>

# AEIC – Agentic Execution Intelligence Coordinator

**AI-driven execution intelligence platform for autonomous deadline-driven workflow management**

## Quick Start

> 📖 **For detailed step-by-step instructions, see [RUN_GUIDE.md](RUN_GUIDE.md)**

### Prerequisites
- **Node.js** (v18+)
- **Python 3.8+** (for RAG microservice)
- **Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))

### Quick Setup (TL;DR)

**Terminal 1 - RAG Service:**
```bash
cd rag_service
pip install -r requirements.txt
python main.py
```

**Terminal 2 - Frontend:**
```bash
# Create .env.local with: VITE_GEMINI_API_KEY=your_key_here
npm install
npm run dev
```

**Browser:** Open `http://localhost:3000`

### Detailed Setup Instructions

1. **Install Frontend Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start the RAG Microservice** (Optional but Recommended)
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
- ✅ **RAG-Based Context Retrieval** - Historical execution memories inform decisions
- ✅ **SLM-First Reasoning** - Cost-optimized deterministic risk calculation
- ✅ **LLM Explainability** - Natural language explanations for AI decisions
- ✅ **Hierarchical Escalation** - Multi-level escalation path (Assignee → Team Lead → Manager → Admin)
- ✅ **Execution Memory** - Self-improving system that learns from escalations
- ✅ **Decision Trace Panel** - Transparent view of AI reasoning process

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS
- **AI Reasoning**: Deterministic SLM logic + Gemini LLM
- **Vector Search**: FAISS (Python microservice with Sentence Transformers)
- **Persistence**: Browser localStorage (MVP)

## Usage

1. **Login** - Use any mock user credentials or create a new account
2. **Create Tasks** - Use the "Delegate New Workflow" form (available to Admins/Team Leads)
3. **Monitor Execution** - Watch tasks in the "Operational Monitor" table
4. **View AI Decisions** - Click on any task to see the Decision Trace panel showing:
   - RAG Memory Recall (historical context)
   - SLM Reasoning Logic (risk calculation)
   - Escalation Path (hierarchical chain)

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

- The RAG microservice is optional - the app will fall back to heuristic retrieval if unavailable
- Tasks are persisted in browser localStorage
- All AI concepts (LLMs, RAG, Agentic RAG, Embeddings, MCP) are fully integrated
- The system uses synthetic/mock data for demonstration purposes

## View in AI Studio

Original AI Studio link: https://ai.studio/apps/temp/1
