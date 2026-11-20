import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import type { Request } from 'express';
import { env } from '../config/env.js';
import type { AuthedRequest } from '../middleware/auth.js';

/**
 * Gateway -> core proxy.
 *
 * The gateway is the only public entry point. It strips client-supplied
 * identity headers and injects a trusted internal token + actor identity.
 *
 * `mountPath` is required because Express removes the mount prefix from
 * `req.url` before the middleware runs. Without restoring it, core would
 * receive `/register` instead of `/api/v1/auth/register`.
 */
export function coreProxy(mountPath = '') {
  return createProxyMiddleware({
    target: env.CORE_URL,
    changeOrigin: true,
    xfwd: true,
    // Không để request treo vô hạn khi game-core bị block (tick/DB lock).
    proxyTimeout: env.PROXY_TIMEOUT_MS,
    timeout: env.PROXY_TIMEOUT_MS,
    pathRewrite: (path) => `${mountPath}${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        const original = req as Request & AuthedRequest;
        proxyReq.setHeader('x-internal-token', env.INTERNAL_SERVICE_TOKEN);
        proxyReq.removeHeader('x-actor-id');
        proxyReq.removeHeader('x-actor-role');

        if (original.actor) {
          proxyReq.setHeader('x-actor-id', original.actor.id);
          proxyReq.setHeader('x-actor-role', original.actor.role);
        }
        if (original.id) {
          proxyReq.setHeader('x-request-id', String(original.id));
        }

        // express.json trên gateway đã parse body thành object. fixRequestBody
        // ghi lại body dưới dạng JSON nhưng không thiết lập Content-Type, khiến
        // core nhận dạng sai (text/plain) và không parse req.body. Thiết lập
        // Content-Type trước khi fixRequestBody ghi body.
        if (original.body && typeof original.body === 'object') {
          proxyReq.setHeader('content-type', 'application/json');
        }

        fixRequestBody(proxyReq, original);
      },
      error: (error, _req, res) => {
        if ('writeHead' in res && !res.headersSent) {
          const code = String((error as { code?: string } | undefined)?.code ?? '');
          const timedOut = code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'ECONNRESET';
          const status = timedOut ? 504 : 502;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              type: `https://efls.game/errors/${timedOut ? 'gateway-timeout' : 'bad-gateway'}`,
              title: timedOut ? 'Máy chủ phản hồi quá lâu' : 'Dịch vụ tạm thời không khả dụng',
              status,
              detail: timedOut
                ? 'Yêu cầu vượt quá thời gian chờ. Vui lòng thử lại.'
                : 'Không kết nối được tới máy chủ game. Vui lòng thử lại sau.',
            }),
          );
        }
      },
    },
  });
}
