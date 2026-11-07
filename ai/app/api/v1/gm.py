from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import GmProposal, GmRequest
from app.services.ai_services import GmService

router = APIRouter(tags=["gm"])


@router.post("/gm/propose", response_model=GmProposal)
async def propose(
    request: GmRequest,
    provider: ProviderDep,
) -> GmProposal:
    return await GmService(provider).propose(request)
