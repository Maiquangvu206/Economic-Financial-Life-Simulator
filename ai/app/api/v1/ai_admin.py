import time
from typing import Any

from fastapi import APIRouter, Body, Request

from app.core.config import Settings, get_settings
from app.providers.fake import FakeProvider
from app.providers.registry import build_provider

router = APIRouter(prefix="/ai-admin", tags=["ai-admin"])


def _base_status(request: Request, settings: Settings, provider: Any) -> dict[str, Any]:
    return {
        "provider": getattr(provider, "name", settings.llm_provider),
        "configuredProvider": settings.llm_provider,
        "failoverChain": [p.strip() for p in (settings.llm_failover_chain or "").split(",") if p.strip()],
        "openaiBaseUrl": settings.openai_base_url if settings.llm_provider != "gemini" else None,
        "openaiModel": settings.openai_model or None,
        "geminiModel": settings.gemini_model or None,
        "timeoutMs": settings.ai_request_timeout_ms,
        "cooldownSec": settings.ai_provider_cooldown_sec,
        "runtimeConfigSource": getattr(request.app.state, "runtime_config_source", "env"),
        "runtimeConfigAppliedAt": getattr(request.app.state, "runtime_config_applied_at", None),
    }


@router.get("/status")
async def get_ai_status(request: Request) -> dict[str, Any]:
    base_settings = getattr(request.app.state, "runtime_settings", None) or get_settings()
    provider = getattr(request.app.state, "provider", None)

    base = _base_status(request, base_settings, provider)

    if provider is None:
        return {**base, "mode": "unknown", "ready": False}

    if hasattr(provider, "get_status"):
        try:
            status = provider.get_status()  # type: ignore[attr-defined]
            return {**base, **status, "ready": True}
        except Exception:
            pass

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


@router.post("/config")
async def apply_ai_config(request: Request, payload: dict[str, Any] = Body(default={})) -> dict[str, Any]:
    """Apply runtime AI config from admin (DB). Protected by x-ai-token at router level."""
    cfg = payload.get("config") if isinstance(payload, dict) and "config" in payload else payload
    if not isinstance(cfg, dict):
        cfg = {}
    base_settings = getattr(request.app.state, "runtime_settings", None) or get_settings()
    try:
        new_settings = Settings.from_admin_config(cfg, base=base_settings)
        provider = build_provider(new_settings)
        request.app.state.provider = provider
        request.app.state.runtime_settings = new_settings
        request.app.state.runtime_config_source = "admin_db"
        request.app.state.runtime_config_applied_at = time.time()
        # return current status snapshot
        return {"ok": True, "applied": True, "status": await get_ai_status(request)}
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "applied": False,
            "error": str(exc),
            "status": await get_ai_status(request),
        }
