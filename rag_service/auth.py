import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer_scheme = HTTPBearer(auto_error=False)
PASSWORD_ITERATIONS = 310_000
PASSWORD_PREFIX = "pbkdf2_sha256"


def _secret_key() -> bytes:
    value = os.getenv("AEIP_SECRET_KEY")
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )
    return value.encode("utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )
    return f"{PASSWORD_PREFIX}${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        prefix, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if prefix != PASSWORD_PREFIX:
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        ).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, digest_hex)


def create_access_token(user_id: str, expires_in: int = 60 * 60 * 8) -> str:
    payload = json.dumps(
        {"sub": user_id, "exp": int(time.time()) + expires_in},
        separators=(",", ":"),
    ).encode("utf-8")
    body = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(_secret_key(), body, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{body.decode('ascii')}.{encoded_signature.decode('ascii')}"


def _decode_access_token(token: str) -> dict[str, Any]:
    try:
        body_part, signature_part = token.split(".", 1)
        body = body_part.encode("ascii")
        supplied_signature = base64.urlsafe_b64decode(
            signature_part + "=" * (-len(signature_part) % 4)
        )
        expected_signature = hmac.new(_secret_key(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("Invalid signature")
        payload = base64.urlsafe_b64decode(body_part + "=" * (-len(body_part) % 4))
        claims = json.loads(payload)
        if not isinstance(claims.get("sub"), str) or claims.get("exp", 0) <= time.time():
            raise ValueError("Expired or invalid token")
        return claims
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    from database import get_database

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = _decode_access_token(credentials.credentials)
    user = await get_database().users.find_one({"id": claims["sub"]})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.get("role") == "LEAD":
        user["role"] = "TEAM_LEAD"
    return user


def require_roles(*roles: str):
    async def dependency(user: dict[str, Any] = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return dependency
