from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import NewsProposal, NewsRequest
from app.services.ai_services import NewsService

router = APIRouter(tags=["news"])


@router.post("/news", response_model=NewsProposal)
async def generate_news(
    request: NewsRequest,
    provider: ProviderDep,
) -> NewsProposal:
    return await NewsService(provider).generate(request)
