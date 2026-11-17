# Production image for the player SPA and admin SPA, served through Tailscale.
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

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
RUN pnpm install --frozen-lockfile

COPY . .
ARG PUBLIC_ORIGIN=https://project1.zorse-mizar.ts.net
ENV VITE_API_BASE_URL= \
    VITE_REALTIME_URL= \
    VITE_ADMIN_URL=${PUBLIC_ORIGIN}/admin/ \
    VITE_PORTAL_URL=${PUBLIC_ORIGIN}
RUN pnpm --filter @efls/web-game... build \
 && VITE_BASE_PATH=/admin/ pnpm --filter @efls/admin... build

FROM nginx:stable-alpine AS runtime
COPY infra/deploy/nginx-project1.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-game/dist/ /usr/share/nginx/html/
COPY --from=build /repo/apps/admin/dist/ /usr/share/nginx/html/admin/
EXPOSE 3000
