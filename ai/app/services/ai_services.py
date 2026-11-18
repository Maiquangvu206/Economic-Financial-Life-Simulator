from datetime import UTC, datetime
from uuid import uuid4

from pydantic import ValidationError

from app.domain.enums import AiTask, GmAction
from app.domain.policies import guard_gm, guard_judge, guard_news, guard_npc, guard_recruitment, guard_sweep
from app.domain.schemas import (
    EducationQuizProposal,
    EducationQuizRequest,
    GmProposal,
    GmRequest,
    JudgeProposal,
    JudgeRequest,
    NewsProposal,
    NewsRequest,
    NpcNegotiationProposal,
    NpcNegotiationRequest,
    ProposalMeta,
    RecruitmentProposal,
    RecruitmentRequest,
    SweepProposal,
    SweepProposeRequest,
)
from app.providers.base import LLMProvider, ProviderError
from app.services.prompt_loader import dump_request, load_prompt

JUDGE_PROMPT_VERSION = "judge@v1"
NEWS_PROMPT_VERSION = "news@v1"
NPC_PROMPT_VERSION = "npc_merchant@v1"
GM_PROMPT_VERSION = "gm_economy@v1"
RECRUITMENT_PROMPT_VERSION = "recruitment@v2"
EDUCATION_QUIZ_PROMPT_VERSION = "education_quiz@v1"
UNDERWORLD_SWEEP_PROMPT_VERSION = "underworld_sweep@v1"


def make_meta(task: AiTask, model: str, version: str) -> ProposalMeta:
    return ProposalMeta(
        proposal_id=uuid4(),
        task=task,
        model=model,
        prompt_version=version,
        created_at=datetime.now(UTC),
    )


def _invalid_output(error: Exception) -> ProviderError:
    return ProviderError(f"LLM output failed schema validation: {error}")


class JudgeService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def evaluate(self, request: JudgeRequest) -> JudgeProposal:
        raw = await self._provider.complete_json(
            task=AiTask.JUDGE.value,
            system_prompt=load_prompt("judge"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = JudgeProposal(
                meta=make_meta(AiTask.JUDGE, self._provider.name, JUDGE_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        return guard_judge(proposal)


class NewsService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def generate(self, request: NewsRequest) -> NewsProposal:
        raw = await self._provider.complete_json(
            task=AiTask.NEWS.value,
            system_prompt=load_prompt("news"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = NewsProposal(
                meta=make_meta(AiTask.NEWS, self._provider.name, NEWS_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        return guard_news(proposal)


class NpcService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def negotiate(self, request: NpcNegotiationRequest) -> NpcNegotiationProposal:
        raw = await self._provider.complete_json(
            task=AiTask.NPC_NEGOTIATION.value,
            system_prompt=load_prompt("npc_merchant"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = NpcNegotiationProposal(
                meta=make_meta(AiTask.NPC_NEGOTIATION, self._provider.name, NPC_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        return guard_npc(proposal)


class GmService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def propose(self, request: GmRequest) -> GmProposal:
        raw = await self._provider.complete_json(
            task=AiTask.GM_ECONOMY.value,
            system_prompt=load_prompt("gm_economy"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = GmProposal(
                meta=make_meta(AiTask.GM_ECONOMY, self._provider.name, GM_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error

        if proposal.action not in request.allowed_actions:
            allowed_values = [action.value for action in request.allowed_actions]
            fallback = "do_nothing" if "do_nothing" in allowed_values else allowed_values[0]
            proposal.action = GmAction(fallback)

        return guard_gm(proposal, request.allowed_actions)


class RecruitmentService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def propose(self, request: RecruitmentRequest) -> RecruitmentProposal:
        raw = await self._provider.complete_json(
            task=AiTask.RECRUITMENT.value,
            system_prompt=load_prompt("recruitment"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = RecruitmentProposal(
                meta=make_meta(AiTask.RECRUITMENT, self._provider.name, RECRUITMENT_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        return guard_recruitment(proposal)


class EducationQuizService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def generate(self, request: EducationQuizRequest) -> EducationQuizProposal:
        raw = await self._provider.complete_json(
            task=AiTask.EDUCATION_QUIZ.value,
            system_prompt=load_prompt("education_quiz"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = EducationQuizProposal(
                meta=make_meta(AiTask.EDUCATION_QUIZ, self._provider.name, EDUCATION_QUIZ_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        # normalize: ensure ids 1..5 and valid correct_index
        fixed = []
        for i, q in enumerate(proposal.questions[:5], start=1):
            qi = q.model_copy()
            qi.id = i
            if qi.correct_index < 0 or qi.correct_index >= len(qi.options):
                qi.correct_index = 0
            fixed.append(qi)
        if len(fixed) != 5:
            raise _invalid_output(ValueError("expected 5 questions"))
        proposal.questions = fixed
        return proposal


class UnderworldSweepService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    async def propose(self, request: SweepProposeRequest) -> SweepProposal:
        raw = await self._provider.complete_json(
            task=AiTask.UNDERWORLD_SWEEP.value,
            system_prompt=load_prompt("underworld_sweep"),
            user_prompt=dump_request(request),
        )
        try:
            proposal = SweepProposal(
                meta=make_meta(AiTask.UNDERWORLD_SWEEP, self._provider.name, UNDERWORLD_SWEEP_PROMPT_VERSION),
                **raw,
            )
        except (ValidationError, TypeError) as error:
            raise _invalid_output(error) from error
        if not request.allow_all and proposal.action == "sweep_all":
            proposal.action = "sweep_targets" if proposal.character_ids else "none"
        return guard_sweep(proposal)
