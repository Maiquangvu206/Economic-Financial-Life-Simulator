# syntax=docker/dockerfile:1.7
#
# AI subsystem image. Build context = repository root.
#   docker build -f infra/docker/ai.Dockerfile -t efls/ai .

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Dependencies first so application changes do not reinstall them.
COPY ai/pyproject.toml ./
RUN pip install --no-cache-dir \
      "fastapi>=0.115.0" \
      "uvicorn[standard]>=0.32.0" \
      "pydantic>=2.10.0" \
      "pydantic-settings>=2.6.0" \
      "httpx>=0.27.0"

COPY ai/app ./app

RUN groupadd --system app && useradd --system --gid app --no-create-home app
USER app
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
