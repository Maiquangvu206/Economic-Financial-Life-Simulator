import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.providers.base import ProviderError
from app.providers.registry import build_provider

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    provider = build_provider(settings)
    logger.info(
        "AI service starting (provider=%s, model=%s)",
        provider.name,
        settings.openai_model if provider.name == "openai" else settings.gemini_model,
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="EFLS AI Subsystem",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.include_router(health_router)
    app.include_router(v1_router)

    @app.exception_handler(ProviderError)
    async def provider_error_handler(_request: Request, exc: ProviderError) -> JSONResponse:
        logger.warning("Provider error: %s (retryable=%s)", exc, exc.retryable)
        return JSONResponse(
            status_code=502,
            content={
                "type": "https://efls.game/errors/ai-provider",
                "title": "AI provider failed",
                "status": 502,
                "detail": str(exc),
                "retryable": exc.retryable,
            },
        )

    return app


app = create_app()
