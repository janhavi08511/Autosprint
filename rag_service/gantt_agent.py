from typing import List, Dict, Optional
from datetime import datetime, timedelta
import networkx as nx
from models import Task, TaskUpdate

class DependencyImpactAnalysis:
    def __init__(self, tasks: List[Task]):
        self.tasks = {t.id: t for t in tasks}
        self.graph = nx.DiGraph()
        self._build_graph(tasks)

    def _build_graph(self, tasks: List[Task]):
        for task in tasks:
            self.graph.add_node(task.id, duration=task.estimatedDuration)
            for dep_id in task.dependencies:
                if dep_id in self.tasks:
                    self.graph.add_edge(dep_id, task.id)

    def calculate_critical_path(self) -> List[str]:
        """
        Identifies the critical path in the dependency graph.
        Returns a list of Task IDs on the critical path.
        """
        if not self.tasks:
            return []
        
        try:
            return nx.dag_longest_path(self.graph)
        except nx.NetworkXUnfeasible:
            # Cycle detected or other graph error
            return []

    def simulate_delay(self, delayed_task_id: str, delay_minutes: int) -> Dict[str, int]:
        """
        Calculates the impact of a delay on dependent tasks.
        Returns a dictionary mapping Task ID to its new start delay (in minutes).
        """
        impacted_tasks = {}
        if delayed_task_id not in self.graph:
            return impacted_tasks

        # Simple forward propagation
        # BFS starting from delayed task
        queue = [(delayed_task_id, delay_minutes)]
        visited = {delayed_task_id}

        while queue:
            current_id, current_delay = queue.pop(0)
            
            # Store impact
            if current_id != delayed_task_id:
                impacted_tasks[current_id] = current_delay

            # Propagate to successors
            for successor in self.graph.successors(current_id):
                if successor not in visited:
                    visited.add(successor)
                    queue.append((successor, current_delay))
        
        return impacted_tasks

class RAGAdaptation:
    def __init__(self, vector_store):
        self.vector_store = vector_store

    def adapt_schedule(self, tasks: List[Task], context: str) -> List[TaskUpdate]:
        """
        Queries RAG for historical patterns and suggests schedule adjustments.
        (Placeholder for now - returns empty list)
        """
        # TODO: Implement RAG query
        return []
