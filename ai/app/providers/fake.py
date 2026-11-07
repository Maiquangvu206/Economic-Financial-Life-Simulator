from typing import Any

from app.providers.base import LLMProvider


class FakeProvider(LLMProvider):
    """Deterministic provider for local development and tests."""

    name = "fake"

    async def complete_json(
        self,
        *,
        task: str,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        del system_prompt, user_prompt
        responses: dict[str, dict[str, Any]] = {
            "judge": {
                "verdict": "settlement",
                "sentence_years": 0,
                "fine": {"amount": 50_000, "currency": "USD"},
                "reasoning": (
                    "Fake provider: the evidence is incomplete, so a settlement is proposed. "
                    "The game core must still validate the evidence and statutes."
                ),
                "confidence": 0.55,
            },
            "news": {
                "headline": "Thị trường chờ tín hiệu mới",
                "body": (
                    "Giới đầu tư đang theo dõi diễn biến vĩ mô. Đây là bản tin giả lập "
                    "dùng cho môi trường phát triển."
                ),
                "reputation_delta": {},
                "stock_impact_pct": {},
            },
            "npc_negotiation": {
                "dialogue": "Tôi cần thêm thời gian để cân nhắc mức giá này.",
                "accept": False,
                "counter_offer": None,
                "mood_delta": 0.0,
            },
            "gm_economy": {
                "action": "do_nothing",
                "magnitude": 0.0,
                "rationale": (
                    "Fake provider: giữ nguyên trạng thái để tránh thay đổi chưa kiểm chứng."
                ),
            },
        }
        if task not in responses:
            raise ValueError(f"Fake provider does not support task {task}")
        return responses[task]
