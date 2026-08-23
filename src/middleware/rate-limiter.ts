import type { Request, Response, NextFunction } from "express";
import { ApiError } from "./error-handler";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

export function rateLimiter(
  windowMs: number,
  max: number,
  message = "Too many requests. Please try again later."
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const isDev = process.env.NODE_ENV !== "production";
    const effectiveMax = isDev ? 500 : max;

    const key = req.ip || req.socket.remoteAddress || "anonymous";
    const now = Date.now();

    const record = memoryStore.get(key);

    if (!record || now > record.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= effectiveMax) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
      next(new ApiError(429, `${message} Try again in ${waitSeconds}s.`));
      return;
    }

    record.count += 1;
    next();
  };
}

export function resetRateLimits(): void {
  memoryStore.clear();
}
