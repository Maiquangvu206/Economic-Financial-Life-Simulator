import json
from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import LLMProvider, ProviderError


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_ms: int | None = None,
        max_tokens: int | None = None,
        label: str | None = None,
    ) -> None:
        if settings is None:
            from app.core.config import get_settings

            settings = get_settings()
        resolved_key = settings.gemini_api_key if api_key is None else api_key
        if not resolved_key:
            raise ProviderError("GEMINI_API_KEY is not set")
        self._api_key = resolved_key
        self._model = model or settings.gemini_model
        self._timeout = (timeout_ms or settings.ai_request_timeout_ms) / 1000
        self._max_tokens = max_tokens or settings.ai_max_output_tokens
        self.name = label or "gemini"

    async def complete_json(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        del task
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": self._max_tokens,
                "responseMimeType": "application/json",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    url,
                    params={"key": self._api_key},
                    json=payload,
                )
        except httpx.TimeoutException as error:
            raise ProviderError("Gemini request timed out", retryable=True) from error
        except httpx.HTTPError as error:
            raise ProviderError(f"Gemini transport error: {error}", retryable=True) from error

        if response.status_code >= 400:
            raise ProviderError(
                f"Gemini returned {response.status_code}",
                retryable=response.status_code >= 500 or response.status_code == 429,
            )

        try:
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise ProviderError("Gemini returned malformed JSON") from error
