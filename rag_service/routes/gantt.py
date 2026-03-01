from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from models import Task
from gantt_agent import DependencyImpactAnalysis
from database import get_database

router = APIRouter()

# Mock function to get tasks - in real app, fetch from DB
async def get_all_tasks():
    # This should interact with the database. 
    # For now, we rely on the caller to pass tasks or fetch from the shared DB connection.
    # We will import the collection from main or dependency in a real scenario.
    pass

@router.post("/critical-path")
async def get_critical_path(tasks: List[Task]):
    """
    Calculates critical path for a given set of tasks.
    """
    analyzer = DependencyImpactAnalysis(tasks)
    critical_path_ids = analyzer.calculate_critical_path()
    return {"critical_path": critical_path_ids}

@router.post("/simulate-delay")
async def simulate_task_delay(tasks: List[Task], delayed_task_id: str, delay_minutes: int):
    """
    Simulates a delay and returns the impact on other tasks.
    """
    analyzer = DependencyImpactAnalysis(tasks)
    impact = analyzer.simulate_delay(delayed_task_id, delay_minutes)
    return {"impact": impact}
