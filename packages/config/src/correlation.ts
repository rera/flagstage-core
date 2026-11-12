import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Response and request header. apps/web/middleware.ts repeats this string. */
export const CORRELATION_HEADER = "x-correlation-id";
export const CORRELATION_ENV = "CORRELATION_ID";

const current = new AsyncLocalStorage<string>();

export function newCorrelationId(): string {
  return randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return current.getStore();
}

export function runWithCorrelation<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
  return current.run(correlationId, fn);
}

export function correlationMixin(): { correlationId?: string } {
  const correlationId = currentCorrelationId();
  return correlationId ? { correlationId } : {};
}
