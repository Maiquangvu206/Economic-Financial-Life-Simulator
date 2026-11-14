from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import RecruitmentProposal, RecruitmentRequest
from app.services.ai_services import RecruitmentService

router = APIRouter(tags=["recruitment"])


@router.post("/recruitment/propose", response_model=RecruitmentProposal)
async def propose(
    request: RecruitmentRequest,
    provider: ProviderDep,
) -> RecruitmentProposal:
    return await RecruitmentService(provider).propose(request)
