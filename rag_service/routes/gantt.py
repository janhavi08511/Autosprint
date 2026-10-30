from fastapi import APIRouter, Depends, HTTPException
from typing import List
from models import Task
from gantt_agent import DependencyImpactAnalysis
from auth import get_current_user

router = APIRouter()

@router.post("/critical-path")
async def get_critical_path(
    tasks: List[Task],
    current_user: dict = Depends(get_current_user),
):
    """
    Calculates critical path for a given set of tasks.
    """
    if current_user.get("role") not in {"ADMIN", "TEAM_LEAD", "MANAGER"}:
        raise HTTPException(status_code=403, detail="Gantt analysis requires a lead role")
    try:
        analyzer = DependencyImpactAnalysis(tasks)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    path = analyzer.calculate_critical_path()
    total_duration = sum(analyzer._duration(task_id) for task_id in path)
    return {"critical_path": path, "total_duration_minutes": total_duration}

@router.post("/simulate-delay")
async def simulate_task_delay(
    tasks: List[Task],
    delayed_task_id: str,
    delay_minutes: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Simulates a delay and returns the impact on other tasks.
    """
    if current_user.get("role") not in {"ADMIN", "TEAM_LEAD", "MANAGER"}:
        raise HTTPException(status_code=403, detail="Gantt analysis requires a lead role")
    try:
        analyzer = DependencyImpactAnalysis(tasks)
        impact = analyzer.simulate_delay(delayed_task_id, delay_minutes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"impact": impact}
