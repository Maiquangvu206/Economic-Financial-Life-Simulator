from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import NpcNegotiationProposal, NpcNegotiationRequest
from app.services.ai_services import NpcService

router = APIRouter(tags=["npc"])


@router.post("/npc/negotiate", response_model=NpcNegotiationProposal)
async def negotiate(
    request: NpcNegotiationRequest,
    provider: ProviderDep,
) -> NpcNegotiationProposal:
    return await NpcService(provider).negotiate(request)
