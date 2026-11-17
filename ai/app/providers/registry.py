from app.core.config import Settings, get_settings
from app.providers.base import LLMProvider, ProviderError
from app.providers.fake import FakeProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai import OpenAIProvider
from app.providers.router import _load_gemini_keys, _load_openai_endpoints, build_failover_provider


def build_provider(settings: Settings | None = None) -> LLMProvider:
    config = settings or get_settings()
    provider = (config.llm_provider or "router").lower().strip()

    if provider == "fake":
        # Existing deployments may still have LLM_PROVIDER=fake from the old
        # default. If API credentials are present, prefer real providers.
        if _load_openai_endpoints(config) or _load_gemini_keys(config):
            return build_failover_provider(config)
        return FakeProvider()
    if provider == "openai":
        return OpenAIProvider(config)
    if provider == "gemini":
        return GeminiProvider(config)
    if provider in {"router", "failover", "auto"}:
        return build_failover_provider(config)

    raise ProviderError(f"Unsupported LLM_PROVIDER: {config.llm_provider}")
