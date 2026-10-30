import asyncio
import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user

router = APIRouter(prefix="/api", tags=["explanations"])
logger = logging.getLogger(__name__)


class ExplanationRequest(BaseModel):
    title: str
    status: str
    priority: str
    risk_score: int = Field(ge=0, le=100)
    action: str
    memories: list[str] = Field(default_factory=list, max_length=20)
    user_role: str


def _generate_with_gemini(prompt: str, api_key: str) -> str:
    payload = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
        }
    ).encode("utf-8")
    request = Request(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3.5-flash:generateContent",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=40) as response:
            result = json.loads(response.read())
    except HTTPError as exc:
        logger.warning("Gemini provider returned HTTP %s", exc.code)
        raise HTTPException(
            status_code=502,
            detail="Explanation provider request failed",
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Gemini provider request failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="Explanation provider request failed",
        ) from exc
    try:
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.warning("Gemini provider returned an invalid response shape")
        raise HTTPException(
            status_code=502,
            detail="Explanation provider returned an invalid response",
        ) from exc


@router.post("/explanations")
async def generate_explanation(
    request: ExplanationRequest,
    _: dict = Depends(get_current_user),
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {
            "explanation": "Gemini is not configured; no LLM explanation was generated.",
            "source": "UNAVAILABLE",
        }

    memories = "\n".join(f"- {memory}" for memory in request.memories)
    prompt = (
        f"Task title: {request.title}\n"
        f"Status: {request.status}\n"
        f"Priority: {request.priority}\n"
        f"Risk score: {request.risk_score}/100\n"
        f"Assignee role: {request.user_role}\n"
        f"Computed action: {request.action}\n"
        f"Historical context:\n{memories}\n"
        f"Explain why {request.action} was selected over other actions. "
        "Keep it professional, transparent, and no more than 3 sentences."
    )
    explanation = await asyncio.to_thread(_generate_with_gemini, prompt, api_key)
    return {"explanation": explanation, "source": "GEMINI"}
