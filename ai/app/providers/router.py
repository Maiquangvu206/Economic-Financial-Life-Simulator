import json
import logging
import time
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.providers.base import LLMProvider, ProviderError
from app.providers.fake import FakeProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai import OpenAIProvider

logger = logging.getLogger(__name__)


@dataclass
class _Slot:
    provider: LLMProvider
    key: str
    cooldown_until: float = 0.0
    failures: int = 0
    successes: int = 0
    requests: int = 0
    last_error: str | None = None
    last_used_at: float | None = None
    last_latency_ms: int | None = None


def _is_quota_or_auth_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        s in msg
        for s in (
            "429",
            "402",
            "quota",
            "rate",
            "insufficient",
            "billing",
            "credit",
            "unauthorized",
            "401",
            "403",
            "api key",
            "invalid",
        )
    )


class FailoverProvider(LLMProvider):
    """Try providers in a rotating failover chain. Useful for free-tier rotation."""

    name = "router"

    def __init__(self, slots: list[_Slot], cooldown_sec: int = 60) -> None:
        if not slots:
            raise ProviderError("FailoverProvider requires at least one provider")
        self._slots = slots
        self._cooldown_sec = max(5, cooldown_sec)
        self._cursor = 0
        self._total_requests = 0
        self._total_successes = 0
        self._total_failures = 0

    async def complete_json(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        n = len(self._slots)
        start = self._cursor % n
        self._cursor = (start + 1) % n
        errors: list[str] = []
        self._total_requests += 1

        for offset in range(n):
            slot = self._slots[(start + offset) % n]
            now = time.monotonic()
            if slot.cooldown_until > now:
                continue
            slot.requests += 1
            slot.last_used_at = time.time()
            t0 = time.perf_counter()
            try:
                result = await slot.provider.complete_json(
                    task=task, system_prompt=system_prompt, user_prompt=user_prompt
                )
                slot.successes += 1
                slot.failures = 0
                slot.last_error = None
                slot.last_latency_ms = int((time.perf_counter() - t0) * 1000)
                self._total_successes += 1
                if offset != 0:
                    logger.info("AI failover succeeded via provider=%s", slot.key)
                return result
            except Exception as exc:  # noqa: BLE001 - must try next provider
                slot.failures += 1
                slot.last_latency_ms = int((time.perf_counter() - t0) * 1000)
                slot.last_error = str(exc)
                retryable = getattr(exc, "retryable", False)
                if _is_quota_or_auth_error(exc) or retryable:
                    extra = 180 if _is_quota_or_auth_error(exc) else 0
                    slot.cooldown_until = time.monotonic() + self._cooldown_sec + extra
                errors.append(f"{slot.key}: {exc}")
                logger.warning("AI provider failed (%s): %s", slot.key, exc)

        self._total_failures += 1
        raise ProviderError(
            "All AI providers failed: " + " | ".join(errors[-5:]), retryable=True
        )

    def get_status(self) -> dict[str, Any]:
        now = time.monotonic()
        providers = []
        for slot in self._slots:
            cd = max(0, int(slot.cooldown_until - now)) if slot.cooldown_until > now else 0
            providers.append(
                {
                    "key": slot.key,
                    "type": getattr(slot.provider, "name", "unknown"),
                    "requests": slot.requests,
                    "successes": slot.successes,
                    "failures": slot.failures,
                    "cooldownSecRemaining": cd,
                    "available": cd == 0,
                    "lastLatencyMs": slot.last_latency_ms,
                    "lastError": slot.last_error,
                    "lastUsedAt": slot.last_used_at,
                }
            )
        return {
            "mode": "router",
            "cooldownSec": self._cooldown_sec,
            "totals": {
                "requests": self._total_requests,
                "successes": self._total_successes,
                "failures": self._total_failures,
            },
            "providers": providers,
        }


def _load_openai_endpoints(settings: Settings) -> list[dict[str, str]]:
    raw = (settings.openai_endpoints or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                out: list[dict[str, str]] = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    base_url = str(item.get("base_url") or item.get("baseUrl") or settings.openai_base_url)
                    api_key = str(item.get("api_key") or item.get("apiKey") or "")
                    model = str(item.get("model") or settings.openai_model)
                    out.append({"base_url": base_url, "api_key": api_key, "model": model})
                if out:
                    return out
        except Exception as exc:  # noqa: BLE001
            logger.warning("Invalid OPENAI_ENDPOINTS JSON, falling back to single endpoint: %s", exc)

    # Backward-compatible single endpoint (may be cloud or local OpenAI-compatible)
    if settings.openai_api_key or not settings.openai_base_url.startswith("https://api.openai.com"):
        return [
            {
                "base_url": settings.openai_base_url,
                "api_key": settings.openai_api_key,
                "model": settings.openai_model,
            }
        ]
    return []


def _load_gemini_keys(settings: Settings) -> list[str]:
    raw = (settings.gemini_api_keys or "").strip()
    keys = [k.strip() for k in raw.split(",") if k.strip()] if raw else []
    if not keys and settings.gemini_api_key:
        keys = [settings.gemini_api_key]
    return keys


def build_failover_provider(settings: Settings) -> LLMProvider:
    chain_raw = (settings.llm_failover_chain or "openai,gemini,fake").strip()
    chain = [p.strip().lower() for p in chain_raw.split(",") if p.strip()]
    if "fake" not in chain:
        chain.append("fake")

    slots: list[_Slot] = []
    openai_eps = _load_openai_endpoints(settings)
    gemini_keys = _load_gemini_keys(settings)

    for kind in chain:
        if kind == "openai":
            for i, ep in enumerate(openai_eps, start=1):
                try:
                    provider = OpenAIProvider(
                        settings,
                        api_key=ep.get("api_key", ""),
                        base_url=ep.get("base_url", settings.openai_base_url),
                        model=ep.get("model", settings.openai_model),
                        label=f"openai#{i}",
                    )
                    slots.append(_Slot(provider=provider, key=f"openai#{i}@{provider._base_url}"))
                except Exception as exc:  # noqa: BLE001
                    logger.info("Skipping OpenAI endpoint #%s: %s", i, exc)
        elif kind == "gemini":
            for i, key in enumerate(gemini_keys, start=1):
                try:
                    provider = GeminiProvider(settings, api_key=key, label=f"gemini#{i}")
                    slots.append(_Slot(provider=provider, key=f"gemini#{i}"))
                except Exception as exc:  # noqa: BLE001
                    logger.info("Skipping Gemini key #%s: %s", i, exc)
        elif kind == "fake":
            slots.append(_Slot(provider=FakeProvider(), key="fake"))
        else:
            logger.warning("Unknown provider in LLM_FAILOVER_CHAIN: %s", kind)

    # Ensure final safety net
    if not slots:
        slots.append(_Slot(provider=FakeProvider(), key="fake"))
    elif slots[-1].key != "fake":
        # keep explicit chain behavior but also guarantee availability
        slots.append(_Slot(provider=FakeProvider(), key="fake"))

    return FailoverProvider(slots, cooldown_sec=settings.ai_provider_cooldown_sec)
