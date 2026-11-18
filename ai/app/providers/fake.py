import json
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
        del system_prompt
        if task == "recruitment":
            try:
                request = json.loads(user_prompt)
            except (TypeError, json.JSONDecodeError):
                request = {}
            role = str(request.get("role_focus") or "Nhân viên vận hành").strip()
            industry = str(request.get("industry") or "doanh nghiệp").strip()
            company = str(request.get("company_id") or request.get("company_name") or "").strip()
            headcount = max(1, min(20, int(request.get("headcount") or 3)))
            profiles = [
                ("intern", "thực tập, nghiên cứu dữ liệu", 5_000_000, 72, "Cần người hướng dẫn và mục tiêu học việc rõ ràng.", "Có tư duy học hỏi, phù hợp xử lý nghiên cứu và tác vụ nền."),
                ("junior", "triển khai công việc hằng ngày", 8_000_000, 78, "Cần đào tạo quy trình nội bộ.", "Có thể nhanh chóng đảm nhận các đầu việc vận hành thường nhật."),
                ("mid", "phân tích và cải tiến quy trình", 12_000_000, 84, "Cần thống nhất quyền tự chủ và chỉ tiêu.", "Có kinh nghiệm phân tích số liệu và đề xuất cải tiến thực tế."),
                ("senior", "quản lý khách hàng và phối hợp liên phòng ban", 18_000_000, 88, "Chi phí cao hơn, kỳ vọng phạm vi phụ trách rõ ràng.", "Có thể xử lý tình huống phức tạp và phối hợp nhiều nhóm."),
                ("lead", "dẫn dắt nhóm và xây dựng chiến lược", 25_000_000, 91, "Cần trao quyền phù hợp với trách nhiệm quản lý.", "Có kinh nghiệm xây đội ngũ và chịu trách nhiệm kết quả dài hạn."),
                ("junior", "kiểm soát chất lượng và tuân thủ", 9_000_000, 80, "Cần tiếp cận quy định và checklist hiện có.", "Bổ sung góc nhìn kiểm soát, giảm sai sót khi mở rộng hoạt động."),
                ("mid", "đối tác và phát triển thị trường", 14_000_000, 86, "Hiệu quả phụ thuộc vào mục tiêu thị trường cụ thể.", "Có thế mạnh xây quan hệ và tìm cơ hội tăng trưởng mới."),
                ("senior", "đào tạo và cố vấn chuyên môn", 20_000_000, 87, "Cần cân đối thời gian cố vấn với khối lượng thực thi.", "Có thể nâng năng lực chuyên môn cho các thành viên khác."),
            ]
            names = [
                "Nguyễn Minh An", "Trần Thu Hà", "Lê Quốc Bảo", "Phạm Gia Linh",
                "Võ Hoàng Nam", "Đặng Khánh Vy", "Bùi Đức Thành", "Đỗ Ngọc Mai",
                "Hồ Anh Tuấn", "Ngô Phương Thảo", "Dương Nhật Minh", "Lý Thanh Trúc",
                "Mai Quang Huy", "Phan Bảo Ngọc", "Cao Minh Khang", "Tạ Thùy Dung",
                "Vũ Hải Đăng", "Đinh Tú Anh", "Trương Quốc Khánh", "Lâm Yến Nhi",
            ]
            offset = sum(ord(char) for char in f"{company}:{role}:{industry}") % len(profiles)
            candidates = []
            for index in range(headcount):
                seniority, specialty, salary, fit, risk, reason = profiles[(offset + index) % len(profiles)]
                candidates.append({
                    "full_name": names[(offset + index) % len(names)],
                    "role_title": f"{role} — {specialty}",
                    "seniority": seniority,
                    "proposed_salary_minor": salary,
                    "fit_score": fit,
                    "risk_note": risk,
                    "reason": f"Phù hợp ngành {industry}; {reason}",
                })
            return {
                "rationale": f"Danh sách cân đối giữa thực thi, chuyên môn và dẫn dắt cho vị trí {role} tại doanh nghiệp ngành {industry}.",
                "candidates": candidates,
            }

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
            "education_quiz": {
                "title": "Bài kiểm tra tốt nghiệp sớm (cơ bản)",
                "questions": [
                    {
                        "id": 1,
                        "question": "Trong lĩnh vực/ngành học này, mục tiêu cơ bản quan trọng nhất là gì?",
                        "options": ["Nắm vững kiến thức nền tảng", "Bỏ qua quy trình", "Chỉ dựa vào may mắn", "Không cần thực hành"],
                        "correct_index": 0,
                        "explanation": "Kiến thức nền tảng là cơ sở để áp dụng và phát triển chuyên môn.",
                    },
                    {
                        "id": 2,
                        "question": "Khi giải quyết một vấn đề chuyên môn cơ bản, bước đầu tiên nên làm là gì?",
                        "options": ["Xác định vấn đề và yêu cầu", "Kết luận ngay", "Bỏ qua dữ liệu", "Làm ngẫu nhiên"],
                        "correct_index": 0,
                        "explanation": "Xác định đúng vấn đề giúp chọn hướng giải quyết phù hợp.",
                    },
                    {
                        "id": 3,
                        "question": "Thái độ làm việc nào sau đây phù hợp với chuẩn mực nghề nghiệp cơ bản?",
                        "options": ["Trung thực và tuân thủ quy định", "Gian lận để đạt kết quả", "Phớt lờ trách nhiệm", "Che giấu sai sót"],
                        "correct_index": 0,
                        "explanation": "Trung thực và tuân thủ quy định là yêu cầu cơ bản trong mọi lĩnh vực.",
                    },
                    {
                        "id": 4,
                        "question": "Để áp dụng kiến thức vào thực tế, điều nào sau đây là cần thiết?",
                        "options": ["Thực hành và đánh giá kết quả", "Chỉ học lý thuyết", "Không cần phản hồi", "Tránh cải tiến"],
                        "correct_index": 0,
                        "explanation": "Thực hành và đánh giá giúp củng cố và cải thiện năng lực.",
                    },
                    {
                        "id": 5,
                        "question": "Khi gặp tình huống chưa rõ trong chuyên môn, cách xử lý phù hợp là gì?",
                        "options": ["Tra cứu, hỏi ý kiến và kiểm chứng", "Đoán mò", "Bỏ qua", "Tự ý làm sai quy trình"],
                        "correct_index": 0,
                        "explanation": "Tra cứu và kiểm chứng giúp đưa ra quyết định chính xác, an toàn.",
                    },
                ],
            },
        }
        if task not in responses:
            raise ValueError(f"Fake provider does not support task {task}")
        return responses[task]
