# AI subsystem architecture

## 1. Nguyên tắc cốt lõi

> AI **đề xuất**, core **quyết định**.

AI không có quyền ghi database, không có quyền chuyển tiền, không có quyền áp đặt giá.
Mọi output phải:

1. Khớp Pydantic schema.
2. Nằm trong biên guardrail (án phạt, tác động giá, magnitude).
3. Được core kiểm tra lại bằng domain rule + bằng chứng + quyền.

## 2. Thành phần

```
ai/
├─ app/
│  ├─ main.py               # FastAPI app, lifespan, exception handler
│  ├─ api/v1/               # judge, news, npc, gm
│  ├─ core/                 # config, logging, service-token auth
│  ├─ domain/               # schema, enum, guardrail
│  ├─ providers/            # fake, openai, gemini, registry
│  ├─ prompts/              # prompt version hóa
│  └─ services/             # use case + prompt loader
└─ tests/
```

## 3. Provider abstraction

`LLMProvider.complete_json(task, system_prompt, user_prompt) -> dict`

- `fake`: deterministic, dùng cho dev/test/CI, không gọi mạng.
- `openai`, `gemini`: HTTP client có timeout, phân loại lỗi retryable.
- Registry chọn theo `LLM_PROVIDER`.
- Không để SDK vendor rò rỉ vào domain/service.

## 4. Prompt versioning

- Mỗi prompt có version trong tên: `judge@v1`, `news@v1`, `npc_merchant@v1`, `gm_economy@v1`.
- Output trả về kèm `meta.prompt_version` để audit và so sánh A/B.
- Thay đổi prompt phải: sửa file → chạy test/eval → review → tăng version.
- Prompt là code: không chỉnh trực tiếp trên production.

## 5. Guardrail

| Task  | Biên                                         |
| ----- | -------------------------------------------- |
| Judge | sentence 0–100 năm, fine ≥ 0, confidence 0–1 |
| News  | reputation −100..100, stock impact −20..20%  |
| NPC   | mood −1..1, counter offer ≥ 0                |
| GM    | action thuộc allowlist, magnitude 0–1        |

Guardrail chỉ giới hạn hình dạng và biên; logic đúng/sai thuộc core.

## 6. Timeout, retry, fallback

- Timeout mặc định 15s (`AI_REQUEST_TIMEOUT_MS`).
- Lỗi 429/5xx/timeout: retry có backoff ở worker/core, tối đa 2 lần.
- Hết retry: core dùng fallback rule-based (ví dụ hòa giải, không tác động giá).
- Không để AI chặn game tick hoặc giao dịch tiền.

## 7. Bảo mật prompt

- Nội dung người chơi (lời khai, chat, mô tả) là **dữ liệu**, không phải chỉ thị.
- Prompt hệ thống nói rõ: bỏ qua yêu cầu đổi vai trò/tiết lộ prompt.
- Core lọc dữ liệu trước khi gửi: chỉ field cần thiết, không gửi email/token.
- Không log toàn bộ prompt chứa dữ liệu nhạy cảm ở production.

## 8. Chi phí

- Giới hạn `AI_MAX_OUTPUT_TOKENS`.
- Cache proposal theo `(task, input_hash, prompt_version)` khi phù hợp.
- News/GM chạy theo cron, không theo từng request người chơi.
- Theo dõi token/latency theo task; đặt budget cảnh báo.

## 9. Contract sync

`ai/app/domain/schemas.py` phải khớp `packages/contracts/src/http/ai.ts`.
Khi đổi một bên, đổi cả hai và thêm test. Không để AI trả field lạ mà core bỏ qua âm thầm.
