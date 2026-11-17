import json
from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import LLMProvider, ProviderError


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout_ms: int | None = None,
        max_tokens: int | None = None,
        label: str | None = None,
    ) -> None:
        if settings is None:
            from app.core.config import get_settings

            settings = get_settings()
        resolved_base = (base_url or settings.openai_base_url or "https://api.openai.com/v1").rstrip("/")
        resolved_key = settings.openai_api_key if api_key is None else api_key
        is_official_openai = resolved_base.startswith("https://api.openai.com")
        if is_official_openai and not resolved_key:
            raise ProviderError("OPENAI_API_KEY is not set")
        self._api_key = resolved_key or ""
        self._base_url = resolved_base
        self._model = model or settings.openai_model
        self._timeout = (timeout_ms or settings.ai_request_timeout_ms) / 1000
        self._max_tokens = max_tokens or settings.ai_max_output_tokens
        self.name = label or "openai"

    async def complete_json(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        del task
        payload = {
            "model": self._model,
            "temperature": 0.2,
            "max_tokens": self._max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
        except httpx.TimeoutException as error:
            raise ProviderError("OpenAI-compatible request timed out", retryable=True) from error
        except httpx.HTTPError as error:
            raise ProviderError(f"OpenAI-compatible transport error: {error}", retryable=True) from error

        if response.status_code >= 400:
            raise ProviderError(
                f"OpenAI-compatible endpoint returned {response.status_code}",
                retryable=response.status_code >= 500 or response.status_code == 429,
            )

        try:
            content = response.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise ProviderError("OpenAI-compatible endpoint returned malformed JSON") from error
