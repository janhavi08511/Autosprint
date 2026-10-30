# 🚀 Complete Guide to Running AEIC Application

This guide will walk you through running both the **React frontend** and **Python RAG microservice**.

---

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- ✅ **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- ✅ **Python 3.8+** - [Download here](https://www.python.org/downloads/)
- ✅ **pip** (Python package manager) - Usually comes with Python
- ✅ **Gemini API Key** - [Get one here](https://makersuite.google.com/app/apikey)

### Verify Installation

```bash
# Check Node.js version
node --version

# Check Python version
python --version
# or
python3 --version

# Check pip
pip --version
# or
pip3 --version
```

---

## 🔧 Step-by-Step Setup

### Step 1: Install Frontend Dependencies

Open a terminal in the project root directory:

```bash
# Install all npm packages
npm install
```

**Expected output**: Packages will be installed. This may take 1-2 minutes.

---

### Step 2: Configure Backend Environment Variables

Copy `.env.example` to `rag_service/.env` and edit it with your MongoDB connection URI and a unique
`AEIP_SECRET_KEY` (at least 32 random bytes). To bootstrap the first administrator, configure both
`AEIP_ADMIN_EMAIL` and `AEIP_ADMIN_PASSWORD`. `GEMINI_API_KEY` is optional and must stay in this
backend-only file; do not put secrets in a Vite `.env.local` file.

**Windows (PowerShell):**
```powershell
Copy-Item .env.example rag_service/.env
notepad rag_service/.env
```

If a Gemini key is needed, obtain one through Google AI Studio and configure it only as
`GEMINI_API_KEY` in `rag_service/.env`.

---

### Step 3: Install Python Dependencies (RAG Service)

Open a **new terminal** and navigate to the `rag_service` directory:

```bash
# Navigate to rag_service folder
cd rag_service

# Install Python packages
pip install -r requirements.txt
# or if you need to use pip3:
pip3 install -r requirements.txt
```

**Expected output**: 
- This will install: `fastapi`, `uvicorn`, `faiss-cpu`, `sentence-transformers`, `numpy`, `pydantic`
- **First-time installation may take 5-10 minutes** (sentence-transformers downloads a ML model)
- You'll see: `Model Loaded.` when the embedding model is ready

---

### Step 4: Start the RAG Microservice

**Keep the terminal in `rag_service` directory** and run:

```bash
python main.py
# or
python3 main.py
```

**Expected output:**
```
Loading Embedding Model...
Model Loaded.
INFO:     Started server process [xxxxx]
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

✅ **RAG Service is now running on `http://localhost:8000`**

> 💡 **Keep this terminal open!** The service needs to stay running.

---

### Step 5: Start the React Frontend

Open a **new terminal** (keep the RAG service terminal running) and navigate to the project root:

```bash
# Make sure you're in the project root (not rag_service)
cd /path/to/agentic-execution-intelligence-platform-(aeip)

# Start the development server
npm run dev
```

**Expected output:**
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

✅ **Frontend is now running on `http://localhost:3000`**

---

### Step 6: Open the Application

Open your web browser and navigate to:

**http://localhost:3000**

You should see the **AEIC login page**!

---

## 🎯 Quick Start (All Commands at Once)

If you're familiar with the setup, here's the quick version:

**Terminal 1 (RAG Service):**
```bash
cd rag_service
pip install -r requirements.txt
python main.py
```

**Terminal 2 (Frontend):**
```bash
# In project root
npm install
npm run dev
```

**Browser:**
```
http://localhost:3000
```

---

## 🧪 Testing the Application

### 1. Login
- Register an assignee account using the "Request Access" option, or sign in with credentials
  provisioned by an administrator.
- Public registration cannot create privileged roles. Bootstrap the first admin using
  `AEIP_ADMIN_EMAIL` and `AEIP_ADMIN_PASSWORD` in the backend environment.

### 2. Create a Task
- If logged in as Admin or Team Lead, you'll see "Delegate New Workflow" form
- Fill in:
  - **Workflow Target**: e.g., "Fix critical bug in payment system"
  - **Urgency**: HIGH/MEDIUM/LOW
  - **TTL (Minutes)**: e.g., `10` (for quick testing)
  - **Assignee**: Select a user or leave "Auto-Assign"
- Click **"Deploy"**

### 3. Watch the Agent Work
- The autonomous agent monitors tasks every **15 seconds**
- Watch the "Operational Monitor" table for:
  - Risk scores updating
  - Status changes (CREATED → AT_RISK → OVERDUE)
  - Agent actions (🔔 REMIND → ⚠️ RISK_ALERT → ⬆️ ESCALATE)

### 4. View AI Decisions
- **Click on any task** in the table
- The **Decision Trace panel** (right side) will show:
  - **RAG Memory Recall**: Historical context retrieved
  - **SLM Reasoning Logic**: LLM-generated explanation
  - **Escalation Path**: Who gets notified at each level

---

## 🔍 Troubleshooting

### Issue: "Cannot find module" errors
**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: RAG Service won't start
**Solution:**
```bash
# Check if port 8000 is already in use
# Windows:
netstat -ano | findstr :8000
# Mac/Linux:
lsof -i :8000

# If port is busy, kill the process or change port in main.py
```

### Issue: "GEMINI_API_KEY not found"
**Solution:**
- Make sure `.env.local` file exists in the **root directory**
- Check that `GEMINI_API_KEY` is configured in `rag_service/.env` if you want provider-generated explanations.
- Restart the React dev server after creating `.env.local`

### Issue: Python packages won't install
**Solution:**
```bash
# Try upgrading pip first
pip install --upgrade pip

# Then install requirements
pip install -r requirements.txt

# If faiss-cpu fails, try:
pip install faiss-cpu --no-cache-dir
```

### Issue: "RAG Service unavailable" in browser console
**Solution:**
- Make sure the Python service is running on port 8000
- Check: `http://localhost:8000/health` should return `{"status": "ok"}`
- The app will work with fallback retrieval, but RAG won't be active

### Issue: Frontend shows blank page
**Solution:**
- Check browser console for errors (F12)
- Make sure you're on `http://localhost:3000` (not 8000)
- Try clearing browser cache

---

## 📊 Running Without RAG Service (Fallback Mode)

The application will work **without the Python RAG service**, but with limited functionality:

- ✅ Task monitoring will work
- ✅ Risk calculation will work
- ✅ Escalations will work
- ⚠️ RAG memory retrieval will use simple heuristics (not semantic search)
- ⚠️ Decision explanations may be less contextual

To run in fallback mode:
1. Skip Step 3 and Step 4 (don't start Python service)
2. Start only the React app (Step 5)
3. The app will automatically fall back to heuristic retrieval

---

## 🛑 Stopping the Application

**To stop:**
1. **Frontend**: Press `Ctrl+C` in the React terminal
2. **RAG Service**: Press `Ctrl+C` in the Python terminal

---

## 📝 Next Steps

Once running:
1. ✅ Explore the dashboard
2. ✅ Create multiple tasks with different deadlines
3. ✅ Watch the autonomous agent make decisions
4. ✅ Check the Decision Trace panel for AI reasoning
5. ✅ Try different user roles (Admin, Team Lead, Employee)

---

## 🆘 Need Help?

If you encounter issues:
1. Check the browser console (F12 → Console tab)
2. Check the terminal output for errors
3. Verify all prerequisites are installed
4. Make sure both services are running (frontend + RAG service)

---

## ✅ Success Checklist

You know everything is working when:
- ✅ RAG service shows "Uvicorn running on http://0.0.0.0:8000"
- ✅ React app shows "Local: http://localhost:3000"
- ✅ Browser loads the login page
- ✅ You can login and see the dashboard
- ✅ Tasks appear in the "Operational Monitor" table
- ✅ Agent actions update every 15 seconds
- ✅ Decision Trace panel shows RAG memories and explanations

**Happy coding! 🎉**
