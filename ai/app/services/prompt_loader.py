import json
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"


def load_prompt(name: str) -> str:
    path = PROMPT_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Missing prompt: {path}")
    return path.read_text(encoding="utf-8")


def dump_request(payload: object) -> str:
    if hasattr(payload, "model_dump_json"):
        return payload.model_dump_json(indent=2)  # type: ignore[no-any-return]
    return json.dumps(payload, ensure_ascii=False, indent=2)
