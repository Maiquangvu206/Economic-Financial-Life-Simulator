from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import AiTask, GmAction, NpcPersonality, Verdict


class Money(BaseModel):
    amount: int = Field(ge=0, description="Minor units (cents)")
    currency: Literal["USD"] = "USD"


class ProposalMeta(BaseModel):
    proposal_id: UUID
    task: AiTask
    model: str
    prompt_version: str
    created_at: datetime


class JudgeRequest(BaseModel):
    case_id: UUID
    defendant_id: UUID
    charges: list[str] = Field(min_length=1, max_length=20)
    evidence_ids: list[UUID] = Field(default_factory=list, max_length=100)
    defense_statement: str = Field(min_length=1, max_length=4000)
    character_has_law_degree: bool = False


class JudgeProposal(BaseModel):
    meta: ProposalMeta
    verdict: Verdict
    sentence_years: int = Field(ge=0, le=100)
    fine: Money
    reasoning: str = Field(min_length=1, max_length=4000)
    confidence: float = Field(ge=0, le=1)


class NewsRequest(BaseModel):
    event_id: UUID
    event_type: str = Field(min_length=1, max_length=80)
    actors: list[dict] = Field(default_factory=list, max_length=20)
    facts: list[str] = Field(min_length=1, max_length=50)
    tone: Literal["neutral", "sensational", "investigative"] = "neutral"


class NewsProposal(BaseModel):
    meta: ProposalMeta
    headline: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=4000)
    reputation_delta: dict[str, float]
    stock_impact_pct: dict[str, float]


class NpcNegotiationRequest(BaseModel):
    npc_id: UUID
    personality: NpcPersonality
    context: str = Field(max_length=4000)
    player_offer: str = Field(max_length=2000)
    fair_value: int = Field(ge=0)


class NpcNegotiationProposal(BaseModel):
    meta: ProposalMeta
    dialogue: str = Field(min_length=1, max_length=1200)
    accept: bool
    counter_offer: int | None = None
    mood_delta: float = Field(ge=-1, le=1)


class GmSnapshot(BaseModel):
    inflation_pct: float
    unemployment_pct: float
    money_supply: int = Field(ge=0)
    market_cap: int = Field(ge=0)


class GmRequest(BaseModel):
    snapshot: GmSnapshot
    allowed_actions: list[GmAction] = Field(min_length=1, max_length=5)


class GmProposal(BaseModel):
    meta: ProposalMeta
    action: GmAction
    magnitude: float = Field(ge=0, le=1)
    rationale: str = Field(min_length=1, max_length=2000)
