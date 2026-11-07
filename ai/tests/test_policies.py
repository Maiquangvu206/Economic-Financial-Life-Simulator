from datetime import UTC, datetime
from uuid import uuid4

from app.domain.policies import clamp, guard_news
from app.domain.schemas import NewsProposal, ProposalMeta


def test_clamp() -> None:
    assert clamp(5, 0, 1) == 1
    assert clamp(-5, 0, 1) == 0


def test_news_guardrails_bound_market_impact() -> None:
    proposal = NewsProposal(
        meta=ProposalMeta(
            proposal_id=uuid4(),
            task="news",
            model="fake",
            prompt_version="news@v1",
            created_at=datetime.now(UTC),
        ),
        headline="Test",
        body="Body",
        reputation_delta={"actor": 500},
        stock_impact_pct={"ACME": 99},
    )
    guarded = guard_news(proposal)
    assert guarded.reputation_delta["actor"] == 100
    assert guarded.stock_impact_pct["ACME"] == 20
