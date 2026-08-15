/**
 * `POST /api/login` checks one shared password on an internet-exposed endpoint,
 * so unlimited attempts are a free offline-speed brute force. This is a
 * deliberately small in-memory limiter: one process, a handful of users, no
 * dependency and no store.
 */
export const LOGIN_MAX_ATTEMPTS = 10
export const LOGIN_WINDOW_MS = 10 * 60 * 1000

export type AttemptLimiter = {
  isBlocked(key: string, now: number): boolean
  recordFailure(key: string, now: number): void
  recordSuccess(key: string): void
}

export function createAttemptLimiter(maxAttempts: number, windowMs: number): AttemptLimiter {
  const attempts = new Map<string, { count: number; resetAt: number }>()

  /** Keeps the map from growing without bound on a stream of unique keys. */
  function prune(now: number): void {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key)
    }
  }

  return {
    isBlocked(key, now) {
      const entry = attempts.get(key)
      if (entry === undefined) return false
      if (entry.resetAt <= now) {
        attempts.delete(key)
        return false
      }
      return entry.count >= maxAttempts
    },

    recordFailure(key, now) {
      prune(now)
      const entry = attempts.get(key)
      if (entry === undefined || entry.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs })
        return
      }
      entry.count += 1
    },

    recordSuccess(key) {
      attempts.delete(key)
    },
  }
}

/**
 * Next route handlers all live in the same module instance, so a module-level
 * limiter is enough here — unlike RoomStore, this state is never read from the
 * custom server side, so it does not need the globalThis singleton in
 * `runtime.ts`.
 */
export const loginLimiter = createAttemptLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)

/**
 * Best-effort client identity behind a reverse proxy. `X-Forwarded-For` is
 * spoofable by anyone talking to the app directly, so this slows a brute force
 * down rather than making one impossible.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim() ?? ''
    if (first !== '') return first
  }
  const real = headers.get('x-real-ip')?.trim() ?? ''
  return real === '' ? 'unknown' : real
}
