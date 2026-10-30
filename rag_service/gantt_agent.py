from collections import deque
from typing import Dict, List

from models import Task, TaskUpdate


class DependencyImpactAnalysis:
    def __init__(self, tasks: List[Task]):
        self.tasks = {task.id: task for task in tasks}
        if len(self.tasks) != len(tasks):
            raise ValueError("Task IDs must be unique")
        self.dependencies: dict[str, list[str]] = {}
        self.successors: dict[str, list[str]] = {task_id: [] for task_id in self.tasks}
        for task in tasks:
            dependencies = list(task.dependencies or [])
            unknown = [dep_id for dep_id in dependencies if dep_id not in self.tasks]
            if unknown:
                raise ValueError(f"Task {task.id} references unknown dependencies: {unknown}")
            self.dependencies[task.id] = dependencies
            for dep_id in dependencies:
                self.successors[dep_id].append(task.id)
        self.topological_order = self._topological_sort()

    def _topological_sort(self) -> list[str]:
        indegree = {task_id: len(deps) for task_id, deps in self.dependencies.items()}
        ready = deque(task_id for task_id, degree in indegree.items() if degree == 0)
        order = []
        while ready:
            task_id = ready.popleft()
            order.append(task_id)
            for successor in self.successors[task_id]:
                indegree[successor] -= 1
                if indegree[successor] == 0:
                    ready.append(successor)
        if len(order) != len(self.tasks):
            raise ValueError("Dependency graph contains a cycle")
        return order

    def _duration(self, task_id: str) -> int:
        return max(0, self.tasks[task_id].estimatedDuration or 0)

    def _scheduled_times(self) -> tuple[dict[str, float], dict[str, float]]:
        starts: dict[str, float] = {}
        finishes: dict[str, float] = {}
        for task_id in self.topological_order:
            task = self.tasks[task_id]
            planned_start = float(task.startDate or 0)
            dependency_finish = max(
                (finishes[dependency] for dependency in self.dependencies[task_id]),
                default=0.0,
            )
            start = max(planned_start, dependency_finish)
            starts[task_id] = start
            finishes[task_id] = start + self._duration(task_id) * 60_000
        return starts, finishes

    def calculate_critical_path(self) -> List[str]:
        """Return the dependency path with the greatest accumulated task duration."""
        if not self.tasks:
            return []
        longest_finish: dict[str, int] = {}
        predecessor: dict[str, str | None] = {}
        for task_id in self.topological_order:
            previous = max(
                self.dependencies[task_id],
                key=lambda dep_id: longest_finish[dep_id],
                default=None,
            )
            longest_finish[task_id] = self._duration(task_id) + (
                longest_finish[previous] if previous else 0
            )
            predecessor[task_id] = previous
        end_task = max(longest_finish, key=longest_finish.get)
        path = []
        current: str | None = end_task
        while current is not None:
            path.append(current)
            current = predecessor[current]
        return list(reversed(path))

    def simulate_delay(self, delayed_task_id: str, delay_minutes: int) -> Dict[str, int]:
        """Propagate a delay through successors after accounting for schedule slack."""
        if delay_minutes < 0:
            raise ValueError("delay_minutes must be non-negative")
        if delayed_task_id not in self.tasks:
            raise ValueError(f"Unknown delayed task: {delayed_task_id}")
        if delay_minutes == 0:
            return {}

        baseline_starts, baseline_finishes = self._scheduled_times()
        shifted_starts: dict[str, float] = {}
        shifted_finishes: dict[str, float] = {}
        impacts: dict[str, int] = {}
        delay_ms = delay_minutes * 60_000

        for task_id in self.topological_order:
            task = self.tasks[task_id]
            planned_start = float(task.startDate or 0)
            dependency_finish = max(
                (shifted_finishes[dependency] for dependency in self.dependencies[task_id]),
                default=0.0,
            )
            new_start = max(planned_start, dependency_finish)
            if task_id == delayed_task_id:
                new_start = max(new_start, baseline_starts[task_id] + delay_ms)
            shift_ms = max(0.0, new_start - baseline_starts[task_id])
            if task_id != delayed_task_id and shift_ms > 0:
                impacts[task_id] = int(round(shift_ms / 60_000))
            shifted_starts[task_id] = new_start
            shifted_finishes[task_id] = new_start + self._duration(task_id) * 60_000

        return impacts


class RAGAdaptation:
    def __init__(self, vector_store):
        self.vector_store = vector_store

    def adapt_schedule(self, tasks: List[Task], context: str) -> List[TaskUpdate]:
        return []
