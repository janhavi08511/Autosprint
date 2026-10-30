import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import HTTPException
from bson import ObjectId

from routes.decisions import create_escalation, transition_notification, without_mongo_id


class FakeCollection:
    def __init__(self, records=None, unique_fields=()):
        self.records = list(records or [])
        self.unique_fields = tuple(unique_fields)

    @staticmethod
    def matches(record, query):
        for key, expected in query.items():
            actual = record.get(key)
            if isinstance(expected, dict):
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
            elif actual != expected:
                return False
        return True

    async def find_one(self, query):
        record = next((item for item in self.records if self.matches(item, query)), None)
        return record.copy() if record else None

    async def insert_one(self, record):
        if any(
            all(existing.get(field) == record.get(field) for field in self.unique_fields)
            for existing in self.records
        ):
            from pymongo.errors import DuplicateKeyError

            raise DuplicateKeyError("duplicate key")
        self.records.append(record.copy())

    async def update_one(self, query, update):
        record = next((item for item in self.records if self.matches(item, query)), None)
        if not record:
            return SimpleNamespace(matched_count=0)
        for key, value in update.get("$set", {}).items():
            target = record
            parts = key.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
        return SimpleNamespace(matched_count=1)


class DecisionWorkflowTests(unittest.IsolatedAsyncioTestCase):
    def make_db(self, users):
        return SimpleNamespace(
            users=FakeCollection(users),
            escalations=FakeCollection(unique_fields=("idempotencyKey",)),
            notifications=FakeCollection(unique_fields=("escalationId",)),
            decision_traces=FakeCollection(),
        )

    def test_mongo_ids_are_removed_from_nested_response_data(self):
        sanitized = without_mongo_id({
            "_id": ObjectId(),
            "nested": {"_id": ObjectId(), "value": "kept"},
            "items": [{"_id": ObjectId(), "value": "also kept"}],
        })

        self.assertEqual(sanitized, {
            "nested": {"value": "kept"},
            "items": [{"value": "also kept"}],
        })

    async def test_escalation_targets_next_role_in_task_team(self):
        db = self.make_db([
            {"id": "assignee-1", "role": "ASSIGNEE", "teamId": "team-a"},
            {"id": "lead-a", "role": "TEAM_LEAD", "teamId": "team-a"},
            {"id": "lead-b", "role": "TEAM_LEAD", "teamId": "team-b"},
        ])
        escalation = await create_escalation(
            db,
            {"id": "task-1", "assigneeId": "assignee-1", "teamId": "team-a"},
            {
                "decisionId": "decision-1",
                "action": "ESCALATE",
                "reasoning": {"riskScore": 82},
            },
        )

        self.assertEqual(escalation["toLevel"], "TEAM_LEAD")
        self.assertEqual(escalation["recipientUserId"], "lead-a")
        self.assertEqual(escalation["deliveryStatus"], "DELIVERED")
        self.assertEqual(len(db.notifications.records), 1)

    async def test_escalation_creation_is_idempotent_per_task_and_target(self):
        db = self.make_db([
            {"id": "assignee-1", "role": "ASSIGNEE", "teamId": "team-a"},
            {"id": "lead-a", "role": "TEAM_LEAD", "teamId": "team-a"},
        ])
        task = {"id": "task-1", "assigneeId": "assignee-1", "teamId": "team-a"}
        first = await create_escalation(
            db, task,
            {"decisionId": "decision-1", "action": "ESCALATE", "reasoning": {"riskScore": 82}},
        )
        second = await create_escalation(
            db, task,
            {"decisionId": "decision-2", "action": "CRITICAL_ESCALATE", "reasoning": {"riskScore": 95}},
        )

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(db.escalations.records), 1)
        self.assertEqual(len(db.notifications.records), 1)

    async def test_notification_requires_recipient_and_acknowledgement_before_resolution(self):
        db = self.make_db([
            {"id": "assignee-1", "role": "ASSIGNEE", "teamId": "team-a"},
            {"id": "lead-a", "role": "TEAM_LEAD", "teamId": "team-a"},
        ])
        escalation = await create_escalation(
            db,
            {"id": "task-1", "assigneeId": "assignee-1", "teamId": "team-a"},
            {"decisionId": "decision-1", "action": "ESCALATE", "reasoning": {"riskScore": 82}},
        )
        db.decision_traces.records.append({
            "decisionId": "decision-1",
            "escalation": {"status": "DELIVERED"},
            "notification": {"status": "DELIVERED"},
        })
        notification_id = escalation["notificationId"]

        with patch("routes.decisions.get_database", return_value=db):
            with self.assertRaises(HTTPException) as unauthorized:
                await transition_notification(
                    notification_id, {"id": "another-user"}, "ACKNOWLEDGED"
                )
            self.assertEqual(unauthorized.exception.status_code, 404)

            with self.assertRaises(HTTPException) as premature:
                await transition_notification(
                    notification_id, {"id": "lead-a"}, "RESOLVED"
                )
            self.assertEqual(premature.exception.status_code, 409)

            acknowledged = await transition_notification(
                notification_id, {"id": "lead-a"}, "ACKNOWLEDGED"
            )
            resolved = await transition_notification(
                notification_id, {"id": "lead-a"}, "RESOLVED"
            )
        self.assertEqual(acknowledged["status"], "ACKNOWLEDGED")
        self.assertEqual(resolved["status"], "RESOLVED")
        self.assertEqual(db.escalations.records[0]["status"], "RESOLVED")
        self.assertEqual(db.decision_traces.records[0]["notification"]["status"], "RESOLVED")


if __name__ == "__main__":
    unittest.main()
