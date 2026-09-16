import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';

export const createApiRateLimiter = (options: { windowMs?: number; readLimit?: number; writeLimit?: number; publicLimit?: number } = {}): RequestHandler => {
  const common = { windowMs: options.windowMs ?? 60_000, standardHeaders: true, legacyHeaders: false,
    message: { code: 'RATE_LIMIT', message: 'Muitas requisições, aguarde alguns instantes' } };
  const publicLimiter = rateLimit({ ...common, limit: options.publicLimit ?? 120 });
  const readLimiter = rateLimit({ ...common, limit: options.readLimit ?? 300,
    keyGenerator: (_req, res) => res.locals.rateLimitKey });
  const writeLimiter = rateLimit({ ...common, limit: options.writeLimit ?? 60,
    keyGenerator: (_req, res) => res.locals.rateLimitKey });
  return (req, res, next) => {
    let userId: string | undefined;
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        if (typeof decoded === 'object' && typeof decoded.id === 'string') userId = decoded.id;
      } catch { /* Unverified requests retain the public IP limit. */ }
    }
    const read = req.method === 'GET' || req.method === 'HEAD';
    const resource = req.path.split('/').filter(Boolean)[0] || 'root';
    const scope = userId ? resource + ':' + (read ? 'read' : 'write') : 'public';
    res.setHeader('X-RateLimit-Scope', scope);
    if (!userId) return publicLimiter(req, res, next);
    res.locals.rateLimitKey = userId + ':' + scope;
    return (read ? readLimiter : writeLimiter)(req, res, next);
  };
};
