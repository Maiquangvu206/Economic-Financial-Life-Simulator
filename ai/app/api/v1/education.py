from fastapi import APIRouter

from app.api.deps import ProviderDep
from app.domain.schemas import EducationQuizProposal, EducationQuizRequest
from app.services.ai_services import EducationQuizService

router = APIRouter(tags=["education"])


@router.post("/education/quiz", response_model=EducationQuizProposal)
async def generate_education_quiz(
    request: EducationQuizRequest,
    provider: ProviderDep,
) -> EducationQuizProposal:
    return await EducationQuizService(provider).generate(request)
