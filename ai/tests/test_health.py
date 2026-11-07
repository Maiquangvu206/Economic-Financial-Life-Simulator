from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_public() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai"
    assert body["provider"] == "fake"


def test_v1_requires_service_token() -> None:
    response = client.post("/v1/judge", json={})
    assert response.status_code == 401
