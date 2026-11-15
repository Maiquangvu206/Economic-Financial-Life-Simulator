from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import SweepProposal, SweepProposeRequest
from app.services.ai_services import UnderworldSweepService

router = APIRouter(tags=["underworld"])


@router.post("/underworld/sweep/propose", response_model=SweepProposal)
async def propose_sweep(
    request: SweepProposeRequest,
    provider: ProviderDep,
) -> SweepProposal:
    return await UnderworldSweepService(provider).propose(request)