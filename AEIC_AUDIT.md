# AEIC Audit

## Phase 1 — Baseline

The initial static audit was completed before live runtime testing. The
runtime evidence below supersedes its original unverified statuses. Existing
uncommitted work outside this task was preserved.

| Feature | Implemented | Connected | Tested | Working | Issue / fix |
| --- | --- | --- | --- | --- | --- |
| Authentication | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Browser registration/login/dashboard/logout plus live API checks: duplicate 400, invalid login 401, authenticated `/me` 200, assignee role denial 403, and protected access without a token 401. |
| Task creation | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Created, read, updated, completed, and refreshed project-linked MongoDB tasks; invalid task returned 422. |
| Task persistence | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Project/task records and agent risk/action updates were read back after fresh login/browser reload. |
| Autonomous monitoring | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Browser monitoring ran repeated cycles; an overdue Task A produced 100/CRITICAL_ESCALATE, then 87 while retaining the action. Task B was later monitored at 39/REMIND. Task A retained exactly one trace, escalation, notification, and learned memory after the repeat cycle. |
| SLM reasoning | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Live outputs included 21/REMIND, 39/REMIND, 97/CRITICAL_ESCALATE, and 100/CRITICAL_ESCALATE; deterministic scenario tests also pass. |
| RAG retrieval | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Live FAISS cosine scores: related deployment memory 0.665; unrelated inventory memory 0.143. In the persisted full flow, Task A's historical memory scored 0.641 and was retrieved by monitored Task B at 0.629. A 0.3 cutoff filters low similarity; empty index returned `[]`. |
| FAISS | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Embedding model loaded; service restarted and rehydrated MongoDB memories; a later similar-task query retrieved persisted records. |
| Gemini explanation | 🟢 | 🟢 | 🟡 PARTIAL | 🟡 PARTIAL | The successful full flow displayed actual Gemini explanations matching Task A's 100/CRITICAL_ESCALATE and Task B's 39/REMIND decisions. Other live requests received upstream 503/502 and gracefully showed “Gemini explanation unavailable”; provider remains intermittent. |
| Escalation | 🟢 | 🟡 PARTIAL | 🟢 VERIFIED | 🟡 PARTIAL | Live API/browser test persisted an escalation to the matching team lead, exposed a recipient-only inbox item, and persisted acknowledge/resolve transitions. Manager/admin handoffs and external delivery are not verified. |
| Execution memory | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Task A escalation memory was stored in MongoDB and FAISS; the actual later Task B agent cycle retrieved that memory at similarity 0.629. Temporary QA records were removed after evidence capture. |
| Project management | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Created, read, updated, and reloaded a project in MongoDB; browser displayed it after a fresh login/reload. |
| Project-task linking | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Linked task appeared in the project task list and retained `projectId` after read-back/reload. |
| Decision Trace | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | Browser displayed persisted Task A and Task B traces with actual FAISS memories/scores, deterministic risk/action, first-hop escalation and recipient state, Gemini explanations, and Task A execution-memory status. |
| Error handling | 🟢 | 🟡 PARTIAL | 🟢 VERIFIED | 🟡 PARTIAL | An aborted live `/search` request invoked local fallback and agent persistence continued; Gemini 502 fallback was displayed without stopping task action. MongoDB/backend outage UX was not tested. |
| Security | 🟢 | 🟢 | 🟡 PARTIAL | 🟡 PARTIAL | Assignee role boundary and protected APIs passed. `.env` is ignored/untracked; no tracked Google API key pattern or frontend key reference was found. Signed-expiry and outage cases remain untested. |
| Automated tests | 🟢 | 🟢 | 🟢 VERIFIED | 🟢 VERIFIED | 7 reasoning/escalation tests, 8 auth/agent-state tests, and 4 decision workflow tests passed; production build, Python compile, and `git diff --check` passed. |
| MCP implementation | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | Final source search found no MCP server/tool protocol; architecture uses ordinary API/context passing. |
| QA/health dashboard | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | ⚪ NOT IMPLEMENTED | No interactive QA dashboard found. |

## Reasoning Formula Found

`computeDecision` starts at 0; adds deadline risk of 60 when overdue, 40 with
less than 2 hours remaining, or 20 with less than 6 hours remaining; adds 20
for a `CREATED` task with less than 1 hour remaining and 10 for an overdue
`IN_PROGRESS` task; multiplies by 1.2/1.0/0.8 for HIGH/MEDIUM/LOW priority;
then adds `(1 - reliabilityScore) * 30`, rounds, and caps at 100. Scores
`>85`, `>65`, `>40`, and `>20` select critical escalation, escalation, risk
alert, and reminder respectively. An overdue task is at least reminded.

## Baseline Critical Finding

The browser monitoring callback originally updated React state and an unused
`AEIP_TASKS` localStorage key but did not call the task API. It now calls an
authenticated agent-state endpoint, which persists risk/action/status updates
to MongoDB. Assignees monitor only their own tasks; managers can update tasks
within their existing scope. Live testing exposed a severity downgrade after
the first overdue update (critical escalation 97 to escalation 73); that
downgrade previously generated a second escalation memory. The agent now
persists the most severe action already taken and only triggers a new action
on a severity increase.

## Fixes Completed

- Added the authenticated task agent-state update route with risk bounds,
  action validation, assignment/manager authorization, and terminal-task guard.
- Persisted agent updates through the frontend API instead of unused localStorage.
- Isolated monitoring errors per task and limited assignees to their own work.
- Persisted seeded and learned RAG memories in MongoDB and reloads them into FAISS
  at startup; FAISS keeps normalized float32 vectors with inner-product search.
- Corrected Decision Trace labels/data and replaced the inaccurate Gemini privacy
  claim with the actual categories sent to the optional provider.
- Switched Gemini to a live-available model, increased its output budget and
  timeout, and label unavailable fallbacks so they are not presented as Gemini
  output. Provider 503s still occur intermittently.
- Added live-score filtering for FAISS results and explicit FAISS/local-fallback
  source labels; the measured related/unrelated scores were 0.665/0.143.
- Suppressed action downgrades from producing a second escalation or memory.
- Added focused Node and Python tests.

## Final Runtime Verification — 2026-10-21

Environment during testing:
- Frontend: 🟢 AVAILABLE at the documented Vite port 3000; stopped after tests.
- Backend: 🟢 AVAILABLE at the documented FastAPI port 8000; connected to MongoDB; stopped after tests.
- MongoDB: 🟢 AVAILABLE; configured remote database responded to ping. All temporary QA users, project/tasks, performance record, and test memories were removed and verified absent.
- RAG: 🟢 AVAILABLE; embedding model loaded and FAISS rehydrated persisted memories. After cleanup/restart, the service reported 6 remaining non-QA memories.
- Gemini: 🟡 CONFIGURED; actual browser generation succeeded, but some calls received upstream HTTP 503 (surfaced by the API as 502) and correctly fell back.

Runtime evidence:
- Authentication: 🟢 VERIFIED — browser registration, dashboard, login, and logout; duplicate registration 400; invalid login 401; authenticated `/me` 200; assignee project-create denial 403; protected request after logout/no token 401.
- Projects/tasks: 🟢 VERIFIED — project create/read/update/reload, task create/update/read/completion, project relationship, and 422 for invalid task. MongoDB read-back and browser reload showed persisted data.
- Monitoring: 🟢 VERIFIED — due-soon tasks produced persisted 21/REMIND decisions. Repeated observations were taken 16 seconds apart. A controlled overdue task changed from risk 97 to 73 after the first update but kept `CRITICAL_ESCALATE`; exactly one execution memory existed for it after the downgrade-suppression fix.
- SLM: 🟢 VERIFIED — observed deterministic risk/action outputs included 21/REMIND and 97/CRITICAL_ESCALATE; completed tasks remained completed and were not re-escalated.
- RAG/FAISS: 🟢 VERIFIED — empty search returned `[]`; related deployment memory scored 0.6647 and an unrelated inventory query scored 0.1431. Low-similarity results are filtered at 0.3. MongoDB memories were reloaded after restart and retrieved for a similar task.
- RAG failure: 🟢 VERIFIED — browser `/search` request was intentionally aborted; console recorded fallback activation, UI labeled local heuristic data as “not RAG,” and the agent persisted the task decision.
- Execution memory: 🟢 VERIFIED — agent escalation memories were stored in MongoDB, reloaded by a restarted RAG service, and returned for a similar future query.
- Gemini: 🟡 PARTIAL — at least one real browser Decision Trace displayed a generated explanation matching risk 21/REMIND. Other live calls encountered provider 503; the UI explicitly showed the unavailable state and deterministic action continued. Missing/invalid-key behavior was not exercised.
- Escalation: 🟡 PARTIAL — critical escalation and the four-level path were persisted/displayed; no actual notification delivery to human escalation recipients was observed.
- Decision Trace: 🟡 PARTIAL — real task data and source labels were rendered in-browser; logs remain in browser memory and are not persisted across reload.
- Security/config: 🟡 PARTIAL — `.env` ignored and untracked, no tracked Google API key pattern or frontend key reference found, protected requests and role denial exercised. MongoDB/backend outage UX and signed-expiry token behavior were not tested.
- MCP: ⚪ NOT IMPLEMENTED — final repository search found no MCP server/tool protocol.

Validation:
- `npm run build`: passed.
- `npm test`: 7 passed, 0 failed.
- `python -m unittest rag_service.test_auth_unit rag_service.test_agent_state_unit`: 8 passed, 0 failed.
- `python -m unittest rag_service.test_decisions_unit`: 4 passed, 0 failed.
- `python -m compileall -q rag_service`: passed.
- `git diff --check`: passed.

Runtime summary: 9 of 12 requested runtime areas fully verified (75%); 3 remain partial. Gemini upstream 503s were handled as an unavailable explanation rather than fabricated output.

## Persisted Escalation and Decision Trace Follow-up — 2026-10-21

Environment and runtime:
- MongoDB: 🟢 AVAILABLE — configured endpoint ping succeeded; test data was removed and verified absent.
- Backend/RAG: 🟢 AVAILABLE — documented FastAPI service reached `/health` with six pre-existing memories reloaded.
- Frontend: 🟢 AVAILABLE — Vite served the app on port 3000 and browser authentication reached the dashboard.
- Gemini: 🟡 CONFIGURED — the initial controlled trace explicitly recorded `UNAVAILABLE`; the later complete demo below records a successful Gemini response.

Evidence:
- A controlled live API request created a MongoDB decision trace and escalation, routed the notification to the matching TEAM_LEAD for the task's team, and returned serializable JSON.
- The authenticated TEAM_LEAD inbox returned the notification; the assignee did not receive it.
- Browser login displayed the persisted task, inbox item, and trace after loading workspace data. The trace showed the decision ID, 88 risk score, ESCALATE action, four-level path, matching recipient, and unavailable-explanation label.
- Browser acknowledge and resolve actions updated the notification and persisted trace status; refreshed API read showed `RESOLVED`.
- Temporary QA users, task, trace, escalation, and notification records were deleted and their absence verified.
- The first live request exposed a nested MongoDB `ObjectId` serialization failure (HTTP 500). Recursive `_id` removal was added at the API response boundary; the same live workflow then passed.
- Focused decision workflow tests cover next-role team routing, duplicate escalation prevention, recipient authorization, lifecycle transition constraints, trace status updates, and nested MongoDB ID serialization (4 passed).

## Complete Observe-to-Learn Demo — 2026-10-21

Runtime evidence:
- Authenticated login succeeded; the project and Task A were created through the live authenticated API and appeared in the browser workspace.
- The browser agent ran its monitoring interval. Task A was overdue/high priority and produced a persisted 100/CRITICAL_ESCALATE decision. The browser displayed the actual FAISS historical deployment memory at similarity 0.641, a matching Gemini explanation, the escalation to the task's TEAM_LEAD, and the stored execution-memory ID/status.
- The recipient inbox displayed the delivered escalation. A separate controlled browser workflow verified acknowledge → resolve and the persisted `RESOLVED` trace state.
- After a repeated monitoring cycle, Task A had exactly one decision trace, escalation, and notification; its action remained critical despite a lower subsequent risk score.
- A similar Task B was created, monitored by the agent at 39/REMIND, and its persisted FAISS-sourced trace contained Task A's learned execution memory at similarity 0.629. Its real Gemini explanation matched the 39/REMIND decision and was displayed in Decision Trace.
- Task A and Task B fixtures, project, temporary users, traces, escalation, notifications, seed memory, and learned memory were removed and verified absent after browser logout.
- Final focused results: frontend build passed; 4 decision workflow tests passed; Python compilation and `git diff --check` passed. Previously passing reasoning/auth tests were not repeated.

Remaining limitations:
- Delivery to the first correct TEAM_LEAD recipient and the full four-level path display were verified. Subsequent live handoffs to MANAGER and ADMIN, and external delivery, were not.
- Gemini provider 502/503 errors occurred in earlier live attempts, but the completed demo received actual Gemini output; fallback remained explicit and core monitoring continued when unavailable.
- Presentation Ready: YES for the demonstrated end-to-end flow; the limitations above remain outside the verified demo path.
