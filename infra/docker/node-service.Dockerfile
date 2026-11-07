# syntax=docker/dockerfile:1.7
#
# Shared multi-stage build for every Node workspace service.
# The build context is the repository root; SERVICE selects the package.
#
#   docker build -f infra/docker/node-service.Dockerfile \
#     --build-arg SERVICE=game-core -t efls/game-core .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
WORKDIR /repo

# Install dependencies from the lockfile only. This layer is cached until a
# package.json or the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/ui/package.json packages/ui/
COPY apps/web-game/package.json apps/web-game/
COPY apps/admin/package.json apps/admin/
COPY services/api-gateway/package.json services/api-gateway/
COPY services/game-core/package.json services/game-core/
COPY services/realtime/package.json services/realtime/
COPY services/worker/package.json services/worker/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG SERVICE
ENV SERVICE=${SERVICE}
COPY . .
RUN test -n "$SERVICE" \
 && pnpm --filter "@efls/${SERVICE}..." build \
 && pnpm --filter "@efls/${SERVICE}" deploy --prod /out

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=build /out/ ./
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
