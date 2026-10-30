import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import HTTPException

from models import TaskAgentStateUpdate
from routes.tasks import update_agent_state


class FakeTasks:
    def __init__(self, task):
        self.task = task

    async def find_one(self, query):
        if query.get("id") == self.task["id"]:
            return self.task.copy()
        return None

    async def update_one(self, query, update):
        if query.get("id") == self.task["id"]:
            self.task.update(update["$set"])


class AgentStateUnitTests(unittest.IsolatedAsyncioTestCase):
    def make_task(self, **updates):
        task = {
            "id": "TASK-1",
            "assigneeId": "USER-1",
            "status": "IN_PROGRESS",
            "deadline": 4_000_000_000_000,
            "riskScore": 0,
            "lastAction": "NONE",
        }
        task.update(updates)
        return task

    async def test_agent_state_persists_and_marks_high_risk(self):
        task = self.make_task()
        db = type("FakeDatabase", (), {"tasks": FakeTasks(task)})()
        with patch("routes.tasks.get_database", return_value=db):
            updated = await update_agent_state(
                "TASK-1",
                TaskAgentStateUpdate(riskScore=80, lastAction="ESCALATE"),
                {"id": "USER-1", "role": "ASSIGNEE"},
            )

        self.assertEqual(updated["riskScore"], 80)
        self.assertEqual(updated["lastAction"], "ESCALATE")
        self.assertEqual(updated["status"], "AT_RISK")
        self.assertIn("updatedAt", updated)

    async def test_agent_state_rejects_completed_tasks(self):
        task = self.make_task(status="COMPLETED")
        db = type("FakeDatabase", (), {"tasks": FakeTasks(task)})()
        with patch("routes.tasks.get_database", return_value=db):
            with self.assertRaises(HTTPException) as error:
                await update_agent_state(
                    "TASK-1",
                    TaskAgentStateUpdate(riskScore=80, lastAction="ESCALATE"),
                    {"id": "USER-1", "role": "ASSIGNEE"},
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(task["riskScore"], 0)

    async def test_agent_state_rejects_another_users_task(self):
        task = self.make_task()
        db = type("FakeDatabase", (), {"tasks": FakeTasks(task)})()
        with patch("routes.tasks.get_database", return_value=db):
            with self.assertRaises(HTTPException) as error:
                await update_agent_state(
                    "TASK-1",
                    TaskAgentStateUpdate(riskScore=80, lastAction="ESCALATE"),
                    {"id": "USER-2", "role": "ASSIGNEE"},
                )

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(task["riskScore"], 0)

    def test_agent_state_rejects_out_of_range_risk(self):
        with self.assertRaises(ValueError):
            TaskAgentStateUpdate(riskScore=101, lastAction="ESCALATE")


if __name__ == "__main__":
    unittest.main()
