import json
from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import LLMProvider, ProviderError


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise ProviderError("GEMINI_API_KEY is not set")
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model
        self._timeout = settings.ai_request_timeout_ms / 1000
        self._max_tokens = settings.ai_max_output_tokens

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
