from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    ai_service_token: str = "change-me-ai-token"
    llm_provider: str = "fake"
    # failover/router: comma-separated provider types in priority order, e.g. "openai,gemini,fake"
    llm_failover_chain: str = "openai,gemini,fake"
    # Optional JSON array for multiple OpenAI-compatible endpoints (rotation/failover), e.g.
    # [{"base_url":"https://api.groq.com/openai/v1","api_key":"...","model":"llama-3.1-8b-instant"}]
    openai_endpoints: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    # Optional comma-separated Gemini API keys for rotation/failover (uses gemini_model for all)
    gemini_api_keys: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    ai_request_timeout_ms: int = 15_000
    ai_max_output_tokens: int = 1_200
    # Cooldown (seconds) when a provider hits quota/rate-limit/auth issues
    ai_provider_cooldown_sec: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
