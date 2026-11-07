from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import JudgeProposal, JudgeRequest
from app.services.ai_services import JudgeService

router = APIRouter(tags=["judge"])


@router.post("/judge", response_model=JudgeProposal)
async def judge(
    request: JudgeRequest,
    provider: ProviderDep,
) -> JudgeProposal:
    return await JudgeService(provider).evaluate(request)
