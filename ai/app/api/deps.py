from typing import Annotated

from fastapi import Depends, Request

from app.core.config import get_settings
from app.providers.base import LLMProvider
from app.providers.registry import build_provider


def get_provider(request: Request) -> LLMProvider:
    """Return singleton provider stored on app.state (falls back to build)."""
    provider = getattr(request.app.state, "provider", None)
    if provider is not None:
        return provider
    provider = build_provider(get_settings())
    request.app.state.provider = provider
    return provider


ProviderDep = Annotated[LLMProvider, Depends(get_provider)]
