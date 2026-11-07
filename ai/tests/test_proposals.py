from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
HEADERS = {"x-ai-token": "test-token"}


def test_judge_returns_advisory_proposal() -> None:
    response = client.post(
        "/v1/judge",
        headers=HEADERS,
        json={
            "case_id": "11111111-1111-1111-1111-111111111111",
            "defendant_id": "22222222-2222-2222-2222-222222222222",
            "charges": ["tax_evasion"],
            "evidence_ids": ["33333333-3333-3333-3333-333333333333"],
            "defense_statement": "Tôi đã khai báo đầy đủ theo luật.",
            "character_has_law_degree": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] in {"guilty", "not_guilty", "settlement"}
    assert body["meta"]["task"] == "judge"
    assert body["meta"]["prompt_version"] == "judge@v1"
    assert 0 <= body["confidence"] <= 1


def test_gm_falls_back_to_allowed_action() -> None:
    response = client.post(
        "/v1/gm/propose",
        headers=HEADERS,
        json={
            "snapshot": {
                "inflation_pct": 3.2,
                "unemployment_pct": 6.1,
                "money_supply": 1000000,
                "market_cap": 500000,
            },
            "allowed_actions": ["raise_rate", "cut_rate"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["action"] in {"raise_rate", "cut_rate"}
    assert 0 <= body["magnitude"] <= 1
