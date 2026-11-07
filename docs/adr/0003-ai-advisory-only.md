# ADR 0003 — AI là cố vấn, không phải trọng tài

- Trạng thái: Accepted
- Ngày: 2026-11-07

## Bối cảnh

GDD dùng AI cho thẩm phán, nhà báo, NPC thương trường và GM kinh tế. LLM có thể hallucinate,
bị prompt injection hoặc thay đổi hành vi theo model. Nếu AI trực tiếp ghi state, kinh tế game
và tính công bằng sẽ không kiểm soát được.

## Quyết định

1. AI service chỉ trả **proposal** theo schema.
2. Game core kiểm tra schema, biên guardrail, bằng chứng, luật và quyền trước khi áp dụng.
3. AI không có quyền truy cập PostgreSQL/Redis hay gọi core.
4. Prompt version hóa; thay đổi phải qua test/eval.
5. Luôn có fallback rule-based khi AI lỗi/timeout.
6. Nội dung người chơi là dữ liệu, không phải chỉ thị.

## Hệ quả

- Game vẫn chạy khi provider LLM down (`LLM_PROVIDER=fake` hoặc fallback).
- Có thể audit vì sao một bản án/tin tức được đưa ra.
- Cần viết và bảo trì lớp validation/guardrail.
- Chất lượng AI là "trải nghiệm", không phải "luật chơi".

## Không chọn

- AI ghi DB trực tiếp: không thể đảm bảo công bằng/rollback.
- AI quyết định tác động giá không giới hạn: phá kinh tế.
- Hard-code mọi thứ, không dùng AI: mất tính dynamic theo GDD.
