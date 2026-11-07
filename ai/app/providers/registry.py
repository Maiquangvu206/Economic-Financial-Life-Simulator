from app.core.config import Settings, get_settings
from app.providers.base import LLMProvider, ProviderError
from app.providers.fake import FakeProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai import OpenAIProvider


def build_provider(settings: Settings | None = None) -> LLMProvider:
    config = settings or get_settings()
    provider = config.llm_provider.lower()

    if provider == "fake":
        return FakeProvider()
    if provider == "openai":
        return OpenAIProvider(config)
    if provider == "gemini":
        return GeminiProvider(config)

    raise ProviderError(f"Unsupported LLM_PROVIDER: {config.llm_provider}")
