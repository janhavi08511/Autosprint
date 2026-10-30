from datetime import datetime
from typing import Any
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from auth import get_current_user
from database import get_database
from models import DecisionTraceCreate, ExecutionMemoryUpdate
from routes.tasks import accessible_task

router = APIRouter(tags=["decisions"])

ACTION_LEVEL = {
    "NONE": 0,
    "REMIND": 1,
    "RISK_ALERT": 2,
    "ESCALATE": 3,
    "CRITICAL_ESCALATE": 4,
}
NEXT_ROLE = {
    "ASSIGNEE": "TEAM_LEAD",
    "TEAM_LEAD": "MANAGER",
    "MANAGER": "ADMIN",
}


def without_mongo_id(record: dict[str, Any] | None) -> dict[str, Any] | None:
    if record is None:
        return None
    return {
        key: without_mongo_id(value) if isinstance(value, dict)
        else [without_mongo_id(item) if isinstance(item, dict) else item for item in value]
        if isinstance(value, list)
        else value
        for key, value in record.items()
        if key != "_id"
    }


async def create_escalation(db, task: dict, trace: dict) -> dict | None:
    assignee = await db.users.find_one({"id": task["assigneeId"]})
    from_role = "ASSIGNEE" if not assignee else assignee.get("role", "ASSIGNEE")
    to_role = NEXT_ROLE.get(from_role)
    if to_role == "TEAM_LEAD":
        recipient_query = {"role": to_role, "teamId": task.get("teamId")}
    elif to_role == "MANAGER":
        recipient_query = {"role": to_role, "deptId": task.get("deptId")}
    elif to_role == "ADMIN":
        recipient_query = {"role": to_role}
    else:
        recipient_query = {}

    recipient = (
        await db.users.find_one(
            {**recipient_query, "id": {"$ne": task["assigneeId"]}}
        )
        if recipient_query
        else None
    )
    idempotency_key = f"{task['id']}:{to_role or 'NO_NEXT_ROLE'}"
    existing = await db.escalations.find_one({"idempotencyKey": idempotency_key})
    if existing:
        return without_mongo_id(existing)

    now = datetime.utcnow()
    escalation_id = f"ESC-{secrets.token_hex(8)}"
    status = "PENDING" if recipient else "DELIVERY_FAILED"
    escalation = {
        "id": escalation_id,
        "idempotencyKey": idempotency_key,
        "taskId": task["id"],
        "decisionId": trace["decisionId"],
        "fromLevel": from_role,
        "toLevel": to_role or "NONE",
        "recipientUserId": recipient["id"] if recipient else None,
        "reason": (
            f"{trace['action']} selected at risk {trace['reasoning']['riskScore']}/100."
        ),
        "riskScore": trace["reasoning"]["riskScore"],
        "action": trace["action"],
        "taskTitle": task.get("title", ""),
        "status": status,
        "deliveryStatus": "PENDING" if recipient else "DELIVERY_FAILED",
        "createdAt": now,
        "acknowledgedAt": None,
        "resolvedAt": None,
        "notificationId": None,
    }
    try:
        await db.escalations.insert_one(escalation)
    except DuplicateKeyError:
        existing = await db.escalations.find_one({"idempotencyKey": idempotency_key})
        return without_mongo_id(existing)

    if recipient:
        notification_id = f"NOT-{secrets.token_hex(8)}"
        notification = {
            "id": notification_id,
            "escalationId": escalation_id,
            "decisionId": trace["decisionId"],
            "recipientUserId": recipient["id"],
            "taskId": task["id"],
            "taskTitle": task.get("title", ""),
            "reason": escalation["reason"],
            "riskScore": escalation["riskScore"],
            "fromLevel": from_role,
            "toLevel": to_role,
            "action": trace["action"],
            "status": "DELIVERED",
            "createdAt": now,
        }
        await db.notifications.insert_one(notification)
        escalation["notificationId"] = notification_id
        escalation["status"] = "DELIVERED"
        escalation["deliveryStatus"] = "DELIVERED"
        await db.escalations.update_one(
            {"id": escalation_id},
            {
                "$set": {
                    "notificationId": notification_id,
                    "status": "DELIVERED",
                    "deliveryStatus": "DELIVERED",
                }
            },
        )
    return escalation


@router.post("/api/tasks/{task_id}/decision-traces")
async def record_decision_trace(
    task_id: str,
    request: DecisionTraceCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    task = await accessible_task(db, task_id, current_user)
    if task.get("status") in {"COMPLETED", "SUBMITTED"}:
        raise HTTPException(status_code=409, detail="Task is not monitored")

    action = request.action
    previous_action = task.get("lastAction", "NONE")
    if ACTION_LEVEL[action] <= ACTION_LEVEL.get(previous_action, 0):
        existing = await db.decision_traces.find_one(
            {"taskId": task_id, "action": previous_action}
        )
        return {
            "created": False,
            "trace": without_mongo_id(existing),
            "task": without_mongo_id(task),
        }

    now = datetime.utcnow()
    task_snapshot = {
        key: task.get(key)
        for key in (
            "id", "title", "description", "status", "priority", "deadline",
            "assigneeId", "teamId", "deptId", "orgId", "projectId",
        )
    }
    trace = {
        "decisionId": request.decisionId,
        "id": request.decisionId,
        "idempotencyKey": f"{task_id}:{action}",
        "taskId": task_id,
        "createdAt": now,
        "timestamp": int(now.timestamp() * 1000),
        "task": task_snapshot,
        "rag": {
            "source": request.retrievalSource,
            "memories": [memory.model_dump() for memory in request.retrievedMemories],
        },
        "retrievedMemories": [memory.model_dump() for memory in request.retrievedMemories],
        "retrievalSource": request.retrievalSource,
        "reasoning": {
            "riskScore": request.riskScore,
            "action": action,
            "summary": "Deterministic risk score calculated from deadline, task status, priority, and assignee reliability.",
            "escalationPath": request.escalationPath,
        },
        "riskScore": request.riskScore,
        "explanation": request.explanation,
        "explanationSource": request.explanationSource,
        "escalationPath": request.escalationPath,
        "action": action,
        "escalation": None,
        "notification": None,
        "llm": {
            "provider": "Gemini" if request.explanationSource == "GEMINI" else "Local",
            "explanation": request.explanation,
            "fallbackUsed": request.explanationSource != "GEMINI",
        },
        "execution": {
            "action": action,
            "status": "DECISION_RECORDED",
            "memoryId": None,
            "memoryStored": False,
        },
    }
    try:
        await db.decision_traces.insert_one(trace)
    except DuplicateKeyError:
        existing = await db.decision_traces.find_one(
            {"taskId": task_id, "action": action}
        )
        return {
            "created": False,
            "trace": without_mongo_id(existing),
            "task": without_mongo_id(task),
        }

    lower_actions = [
        name for name, level in ACTION_LEVEL.items()
        if level < ACTION_LEVEL[action]
    ]
    update_result = await db.tasks.update_one(
        {
            "id": task_id,
            "$or": [
                {"lastAction": {"$in": lower_actions}},
                {"lastAction": {"$exists": False}},
            ],
        },
        {
            "$set": {
                "riskScore": request.riskScore,
                "lastAction": action,
                "status": "AT_RISK" if request.riskScore > 60 else task.get("status"),
                "updatedAt": now,
            }
        },
    )
    if update_result.matched_count == 0:
        latest_task = await db.tasks.find_one({"id": task_id})
        await db.decision_traces.delete_one({"decisionId": request.decisionId})
        if latest_task and ACTION_LEVEL.get(latest_task.get("lastAction", "NONE"), 0) >= ACTION_LEVEL[action]:
            existing = await db.decision_traces.find_one(
                {"taskId": task_id, "action": latest_task.get("lastAction")}
            )
            return {
                "created": False,
                "trace": without_mongo_id(existing),
                "task": without_mongo_id(latest_task),
            }
        raise HTTPException(status_code=409, detail="Task decision changed concurrently")

    if action in {"ESCALATE", "CRITICAL_ESCALATE"}:
        escalation = await create_escalation(db, task, trace)
        trace["escalation"] = escalation
        if escalation and escalation.get("notificationId"):
            trace["notification"] = {
                "id": escalation["notificationId"],
                "recipientUserId": escalation["recipientUserId"],
                "status": escalation["deliveryStatus"],
            }
        await db.decision_traces.update_one(
            {"decisionId": request.decisionId},
            {"$set": {"escalation": trace["escalation"], "notification": trace["notification"]}},
        )
    updated_task = await db.tasks.find_one({"id": task_id})
    return {
        "created": True,
        "trace": without_mongo_id(trace),
        "task": without_mongo_id(updated_task),
    }


@router.get("/api/tasks/{task_id}/decision-traces")
async def get_task_decision_traces(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    await accessible_task(get_database(), task_id, current_user)
    records = await get_database().decision_traces.find(
        {"taskId": task_id}
    ).sort("createdAt", -1).to_list(100)
    return [without_mongo_id(record) for record in records]


@router.get("/api/decision-traces/{decision_id}")
async def get_decision_trace(
    decision_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    trace = await db.decision_traces.find_one({"decisionId": decision_id})
    if not trace:
        raise HTTPException(status_code=404, detail="Decision trace not found")
    await accessible_task(db, trace["taskId"], current_user)
    return without_mongo_id(trace)


@router.patch("/api/decision-traces/{decision_id}/execution-memory")
async def update_trace_memory(
    decision_id: str,
    update: ExecutionMemoryUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    trace = await db.decision_traces.find_one({"decisionId": decision_id})
    if not trace:
        raise HTTPException(status_code=404, detail="Decision trace not found")
    await accessible_task(db, trace["taskId"], current_user)
    result = await db.decision_traces.update_one(
        {"decisionId": decision_id},
        {
            "$set": {
                "execution.memoryId": update.memoryId,
                "execution.memoryStored": update.stored,
                "execution.status": "MEMORY_STORED" if update.stored else "MEMORY_UNAVAILABLE",
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Decision trace not found")
    return without_mongo_id(await db.decision_traces.find_one({"decisionId": decision_id}))


@router.get("/api/notifications/")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    records = await get_database().notifications.find(
        {"recipientUserId": current_user["id"]}
    ).sort("createdAt", -1).to_list(100)
    return [without_mongo_id(record) for record in records]


async def transition_notification(
    notification_id: str,
    current_user: dict,
    target_status: str,
):
    db = get_database()
    notification = await db.notifications.find_one(
        {"id": notification_id, "recipientUserId": current_user["id"]}
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    escalation = await db.escalations.find_one({"id": notification["escalationId"]})
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    current_status = escalation["status"]
    if target_status == "ACKNOWLEDGED":
        if current_status == "ACKNOWLEDGED":
            return without_mongo_id(notification)
        if current_status != "DELIVERED":
            raise HTTPException(status_code=409, detail="Escalation cannot be acknowledged from its current state")
        updates = {"status": target_status, "acknowledgedAt": datetime.utcnow()}
    else:
        if current_status == "RESOLVED":
            return without_mongo_id(notification)
        if current_status != "ACKNOWLEDGED":
            raise HTTPException(status_code=409, detail="Escalation must be acknowledged before resolution")
        updates = {"status": target_status, "resolvedAt": datetime.utcnow()}

    result = await db.escalations.update_one(
        {"id": escalation["id"], "status": current_status}, {"$set": updates}
    )
    if result.matched_count == 0:
        latest = await db.escalations.find_one({"id": escalation["id"]})
        if not latest or latest.get("status") != target_status:
            raise HTTPException(status_code=409, detail="Escalation changed concurrently")
        updates = {
            "status": latest["status"],
            "acknowledgedAt": latest.get("acknowledgedAt"),
            "resolvedAt": latest.get("resolvedAt"),
        }
    await db.notifications.update_one({"id": notification_id}, {"$set": updates})
    await db.decision_traces.update_one(
        {"decisionId": escalation["decisionId"]},
        {"$set": {"escalation.status": target_status, "notification.status": target_status}},
    )
    notification.update(updates)
    return without_mongo_id(notification)


@router.post("/api/notifications/{notification_id}/acknowledge")
async def acknowledge_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await transition_notification(notification_id, current_user, "ACKNOWLEDGED")


@router.post("/api/notifications/{notification_id}/resolve")
async def resolve_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await transition_notification(notification_id, current_user, "RESOLVED")
