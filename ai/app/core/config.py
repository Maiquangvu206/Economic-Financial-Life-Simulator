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

    @classmethod
    def from_admin_config(cls, cfg: dict, base: "Settings | None" = None) -> "Settings":
        """Build runtime settings from admin-saved config (DB) with env defaults as fallback."""
        import json

        base = base or get_settings()
        c = cfg or {}
        provider = str(c.get("provider") or base.llm_provider or "fake")
        failover_chain = str(c.get("failoverChain") or base.llm_failover_chain or "openai,gemini,fake")
        try:
            cooldown_sec = int(c.get("cooldownSec", base.ai_provider_cooldown_sec))
        except Exception:
            cooldown_sec = base.ai_provider_cooldown_sec
        try:
            timeout_ms = int(c.get("timeoutMs", base.ai_request_timeout_ms))
        except Exception:
            timeout_ms = base.ai_request_timeout_ms

        eps = c.get("openaiEndpoints") or []
        norm_eps = []
        if isinstance(eps, list):
            for e in eps:
                if not isinstance(e, dict):
                    continue
                if e.get("enabled") is False:
                    continue
                base_url = str(e.get("baseUrl") or e.get("base_url") or "").strip()
                api_key = str(e.get("apiKey") or e.get("api_key") or "").strip()
                model = str(e.get("model") or "").strip()
                if not base_url and not api_key and not model:
                    continue
                if api_key == "********":
                    api_key = ""
                norm_eps.append({"base_url": base_url, "api_key": api_key, "model": model})
        openai_endpoints = json.dumps(norm_eps, ensure_ascii=False) if norm_eps else ""

        gkeys = c.get("geminiApiKeys") or []
        gkeys_list: list[str] = []
        if isinstance(gkeys, list):
            for k in gkeys:
                if isinstance(k, str):
                    val = k.strip()
                    if val and val != "********":
                        gkeys_list.append(val)
                elif isinstance(k, dict):
                    if k.get("enabled") is False:
                        continue
                    val = str(k.get("key") or k.get("apiKey") or "").strip()
                    if val and val != "********":
                        gkeys_list.append(val)
        else:
            raw = str(gkeys or "").strip()
            if raw:
                gkeys_list = [x.strip() for x in raw.split(",") if x.strip() and x.strip() != "********"]
        gkeys_str = ",".join(gkeys_list)

        openai_api_key = str(c.get("openaiApiKey") or "")
        if openai_api_key == "********":
            openai_api_key = base.openai_api_key
        gemini_api_key = str(c.get("geminiApiKey") or "")
        if gemini_api_key == "********":
            gemini_api_key = base.gemini_api_key

        return cls(
            app_env=base.app_env,
            ai_service_token=base.ai_service_token,
            llm_provider=provider,
            llm_failover_chain=failover_chain,
            openai_endpoints=openai_endpoints,
            openai_api_key=openai_api_key,
            openai_base_url=str(c.get("openaiBaseUrl") or base.openai_base_url or "https://api.openai.com/v1"),
            openai_model=str(c.get("openaiModel") or base.openai_model or ""),
            gemini_api_keys=gkeys_str,
            gemini_api_key=gemini_api_key,
            gemini_model=str(c.get("geminiModel") or base.gemini_model or "gemini-1.5-flash"),
            ai_request_timeout_ms=max(1000, timeout_ms),
            ai_max_output_tokens=base.ai_max_output_tokens,
            ai_provider_cooldown_sec=max(5, cooldown_sec),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
