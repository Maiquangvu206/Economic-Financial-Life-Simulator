from app.domain.enums import GmAction
from app.domain.schemas import (
    GmProposal,
    JudgeProposal,
    NewsProposal,
    NpcNegotiationProposal,
)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def guard_judge(proposal: JudgeProposal) -> JudgeProposal:
    """Bounds only. Guilt/innocence logic belongs to the game core rule engine."""
    proposal.sentence_years = int(clamp(proposal.sentence_years, 0, 100))
    proposal.fine.amount = max(0, proposal.fine.amount)
    proposal.confidence = clamp(proposal.confidence, 0.0, 1.0)
    return proposal


def guard_news(proposal: NewsProposal) -> NewsProposal:
    proposal.reputation_delta = {
        key: clamp(float(value), -100.0, 100.0) for key, value in proposal.reputation_delta.items()
    }
    proposal.stock_impact_pct = {
        key: clamp(float(value), -20.0, 20.0) for key, value in proposal.stock_impact_pct.items()
    }
    return proposal


def guard_npc(proposal: NpcNegotiationProposal) -> NpcNegotiationProposal:
    proposal.mood_delta = clamp(proposal.mood_delta, -1.0, 1.0)
    if proposal.counter_offer is not None:
        proposal.counter_offer = max(0, proposal.counter_offer)
    return proposal


def guard_gm(proposal: GmProposal, allowed_actions: list[GmAction]) -> GmProposal:
    proposal.magnitude = clamp(proposal.magnitude, 0.0, 1.0)
    if proposal.action not in allowed_actions:
        raise ValueError("GM proposed an action that is not allowed")
    return proposal
