import json
from typing import Any

import httpx

from app.core.config import Settings
from app.providers.base import LLMProvider, ProviderError


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise ProviderError("OPENAI_API_KEY is not set")
        self._api_key = settings.openai_api_key
        self._model = settings.openai_model
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
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
        except httpx.TimeoutException as error:
            raise ProviderError("OpenAI request timed out", retryable=True) from error
        except httpx.HTTPError as error:
            raise ProviderError(f"OpenAI transport error: {error}", retryable=True) from error

        if response.status_code >= 400:
            raise ProviderError(
                f"OpenAI returned {response.status_code}",
                retryable=response.status_code >= 500 or response.status_code == 429,
            )

        try:
            content = response.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise ProviderError("OpenAI returned malformed JSON") from error
