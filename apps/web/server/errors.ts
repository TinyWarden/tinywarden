export class AppError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfter?: number,
    readonly tokenId?: string) {
    super(code);
  }
}

export function fail(code: string, status: number): never { throw new AppError(code, status); }

export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; constraint?: unknown };
  return value.code === code && (constraint === undefined || value.constraint === constraint);
}
