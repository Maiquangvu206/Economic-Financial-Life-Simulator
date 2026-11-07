from typing import Annotated

from fastapi import Depends

from app.core.config import get_settings
from app.providers.base import LLMProvider
from app.providers.registry import build_provider


def get_provider() -> LLMProvider:
    """FastAPI dependency. Provider construction is validated at startup."""
    return build_provider(get_settings())


ProviderDep = Annotated[LLMProvider, Depends(get_provider)]
