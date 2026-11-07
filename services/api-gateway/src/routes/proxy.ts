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

        fixRequestBody(proxyReq, original);
      },
      error: (_error, _req, res) => {
        if ('writeHead' in res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              type: 'https://efls.game/errors/bad-gateway',
              title: 'Core service unavailable',
              status: 502,
            }),
          );
        }
      },
    },
  });
}
