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
            "recruitment": {
                "rationale": "Đề xuất ứng viên theo nhu cầu vận hành; người chơi cần duyệt trước khi tuyển.",
                "candidates": [
                    {
                        "full_name": "Nguyễn Minh An",
                        "role_title": "Nhân viên vận hành",
                        "seniority": "junior",
                        "proposed_salary_minor": 8_000_000,
                        "fit_score": 78,
                        "risk_note": "Cần đào tạo quy trình nội bộ.",
                        "reason": "Phù hợp vận hành cơ bản, chi phí hợp lý.",
                    },
                    {
                        "full_name": "Trần Thu Hà",
                        "role_title": "Chuyên viên kinh doanh",
                        "seniority": "mid",
                        "proposed_salary_minor": 12_000_000,
                        "fit_score": 82,
                        "risk_note": "Kỳ vọng thưởng theo doanh số.",
                        "reason": "Kinh nghiệm bán hàng, hỗ trợ tăng doanh thu.",
                    },
                    {
                        "full_name": "Lê Quốc Bảo",
                        "role_title": "Kế toán tổng hợp",
                        "seniority": "mid",
                        "proposed_salary_minor": 14_000_000,
                        "fit_score": 80,
                        "risk_note": "Cần kiểm soát tuân thủ và chứng từ.",
                        "reason": "Hỗ trợ sổ cái, báo cáo và tối ưu chi phí hợp lệ.",
                    },
                ],
            },
        }
        if task not in responses:
            raise ValueError(f"Fake provider does not support task {task}")
        return responses[task]
