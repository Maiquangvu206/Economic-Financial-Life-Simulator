from typing import Any

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.providers.fake import FakeProvider

router = APIRouter(prefix="/ai-admin", tags=["ai-admin"])


@router.get("/status")
async def get_ai_status(request: Request) -> dict[str, Any]:
    settings = get_settings()
    provider = getattr(request.app.state, "provider", None)

    base = {
        "provider": getattr(provider, "name", settings.llm_provider),
        "configuredProvider": settings.llm_provider,
        "failoverChain": [p.strip() for p in (settings.llm_failover_chain or "").split(",") if p.strip()],
        "openaiBaseUrl": settings.openai_base_url if settings.llm_provider != "gemini" else None,
        "openaiModel": settings.openai_model or None,
        "geminiModel": settings.gemini_model or None,
        "timeoutMs": settings.ai_request_timeout_ms,
        "cooldownSec": settings.ai_provider_cooldown_sec,
    }

    if provider is None:
        return {**base, "mode": "unknown", "ready": False}

    if hasattr(provider, "get_status"):
        try:
            status = provider.get_status()  # type: ignore[attr-defined]
            return {**base, **status, "ready": True}
        except Exception:
            pass

    # Simple provider status
    return {
        **base,
        "mode": "single",
        "ready": True,
        "totals": {"requests": None, "successes": None, "failures": None},
        "providers": [
            {
                "key": getattr(provider, "name", "unknown"),
                "type": getattr(provider, "name", "unknown"),
                "requests": None,
                "successes": None,
                "failures": None,
                "cooldownSecRemaining": 0,
                "available": True,
                "lastLatencyMs": None,
                "lastError": None,
                "lastUsedAt": None,
            }
        ],
        "isFake": isinstance(provider, FakeProvider),
    }
