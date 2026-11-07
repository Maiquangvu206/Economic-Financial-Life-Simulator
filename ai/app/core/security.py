import secrets

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def require_service_token(
    x_ai_token: str | None = Header(default=None),
) -> None:
    """Only the game core (or an operator tool) may call this service."""
    settings = get_settings()
    expected = settings.ai_service_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service token is not configured",
        )
    if not x_ai_token or not secrets.compare_digest(x_ai_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid AI service token",
        )
