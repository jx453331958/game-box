import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'gb_session'
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
export const GRANT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function grantCookieName(roomId: string): string {
  return `gb_grant_${roomId}`
}

function sign(payload: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${mac}`
}

/** Returns the payload when the signature checks out, otherwise null. */
function unsign(signed: string, secret: string): string | null {
  const separator = signed.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = signed.slice(0, separator)
  const provided = signed.slice(separator + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return null
  if (!timingSafeEqual(providedBuf, expectedBuf)) return null
  return payload
}

export function createSessionValue(issuedAt: number, secret: string): string {
  return sign(`session:${issuedAt}`, secret)
}

export function isSessionValid(
  value: string | undefined,
  secret: string,
  now: number,
): boolean {
  if (value === undefined || value === '') return false
  const payload = unsign(value, secret)
  if (payload === null) return false
  const match = /^session:(\d+)$/.exec(payload)
  if (match === null) return false
  const issuedAt = Number(match[1])
  return now - issuedAt <= SESSION_MAX_AGE_MS && now >= issuedAt
}

export function createGrantValue(roomId: string, issuedAt: number, secret: string): string {
  return sign(`grant:${roomId}:${issuedAt}`, secret)
}

export function isGrantValid(
  value: string | undefined,
  roomId: string,
  secret: string,
  now: number,
): boolean {
  if (value === undefined || value === '') return false
  const payload = unsign(value, secret)
  if (payload === null) return false
  const match = /^grant:([A-Za-z0-9]+):(\d+)$/.exec(payload)
  if (match === null || match[1] !== roomId) return false
  const issuedAt = Number(match[2])
  return now - issuedAt <= GRANT_MAX_AGE_MS && now >= issuedAt
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHmac('sha256', 'password-compare').update(input).digest()
  const b = createHmac('sha256', 'password-compare').update(expected).digest()
  return timingSafeEqual(a, b)
}
