import type { NextFunction, Request, Response } from 'express';

type CachedResponse = {
  status: number;
  body: unknown;
  contentType?: string;
  expiresAt: number;
};

type PendingEntry = {
  promise: Promise<CachedResponse>;
};

const CACHE_TTL_MS = 60_000;
const store = new Map<string, CachedResponse | PendingEntry>();

function isPending(v: CachedResponse | PendingEntry): v is PendingEntry {
  return (v as PendingEntry).promise instanceof Promise;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (!isPending(v) && v.expiresAt <= now) store.delete(k);
  }
}

setInterval(cleanupExpired, 30_000).unref?.();

function getActorKey(req: Request): string {
  const actor = (req as any).actor as { userId?: string; characterId?: string } | undefined;
  return actor?.userId || actor?.characterId || req.ip || 'anonymous';
}

function shouldHandle(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  const key = req.header('x-idempotency-key') || req.header('X-Idempotency-Key');
  return typeof key === 'string' && key.trim().length > 0;
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!shouldHandle(req)) {
      next();
      return;
    }

    const idemKey = String(req.header('x-idempotency-key') || req.header('X-Idempotency-Key') || '').trim();
    if (!idemKey) {
      next();
      return;
    }

    const cacheKey = `${getActorKey(req)}:${req.method.toUpperCase()}:${req.originalUrl}:${idemKey}`;
    const now = Date.now();
    const existing = store.get(cacheKey);

    if (existing) {
      if (isPending(existing)) {
        void existing.promise
          .then((cached) => {
            if (cached.contentType) res.setHeader('Content-Type', cached.contentType);
            res.status(cached.status).json(cached.body);
          })
          .catch(() => next());
        return;
      }
      if (existing.expiresAt > now) {
        if (existing.contentType) res.setHeader('Content-Type', existing.contentType);
        res.status(existing.status).json(existing.body);
        return;
      }
      store.delete(cacheKey);
    }

    let resolvePending!: (v: CachedResponse) => void;
    let rejectPending!: (e: unknown) => void;
    const pendingPromise = new Promise<CachedResponse>((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
    });
    store.set(cacheKey, { promise: pendingPromise });

    let capturedStatus = 200;
    let capturedBody: unknown = undefined;
    let capturedContentType: string | undefined;

    const originalStatus = res.status.bind(res);
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.status = ((code: number) => {
      capturedStatus = code;
      return originalStatus(code);
    }) as any;

    res.json = ((body: unknown) => {
      capturedBody = body;
      capturedContentType = String(res.getHeader('Content-Type') || 'application/json; charset=utf-8');
      return originalJson(body);
    }) as any;

    res.send = ((body: unknown) => {
      if (capturedBody === undefined) {
        capturedBody = body;
        capturedContentType = String(res.getHeader('Content-Type') || '');
      }
      return originalSend(body as any);
    }) as any;

    res.on('finish', () => {
      try {
        if (capturedStatus < 500) {
          const cached: CachedResponse = {
            status: capturedStatus,
            body: capturedBody,
            contentType: capturedContentType,
            expiresAt: Date.now() + CACHE_TTL_MS,
          };
          store.set(cacheKey, cached);
          resolvePending(cached);
          return;
        }
        store.delete(cacheKey);
        rejectPending(new Error('not cached'));
      } catch {
        store.delete(cacheKey);
        try { rejectPending(new Error('cache error')); } catch { /* ignore */ }
      }
    });

    res.on('close', () => {
      const cur = store.get(cacheKey);
      if (cur && isPending(cur)) {
        const fallback: CachedResponse = { status: capturedStatus || 500, body: capturedBody ?? null, expiresAt: Date.now() - 1 };
        try { resolvePending(fallback); } catch { /* ignore */ }
        store.delete(cacheKey);
      }
    });

    next();
  } catch {
    next();
  }
}