import { NextResponse } from 'next/server'
import { getConfig } from '@/server/runtime'
import { clientKey, loginLimiter } from '@/server/auth/rate-limit'
import { createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/server/auth/tokens'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = Date.now()
  const key = clientKey(request.headers)
  if (loginLimiter.isBlocked(key, now)) {
    return NextResponse.json({ ok: false, message: '尝试次数过多，请稍后再试' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const config = getConfig()

  if (!passwordMatches(password, config.password)) {
    loginLimiter.recordFailure(key, now)
    return NextResponse.json({ ok: false, message: '密码不对' }, { status: 401 })
  }
  loginLimiter.recordSuccess(key)

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(now, config.sessionSecret),
    httpOnly: true,
    sameSite: 'lax',
    // The browser-facing origin is HTTPS even though the container speaks plain
    // HTTP behind the proxy. Browsers exempt http://localhost from the Secure
    // requirement, so this is safe for local development too.
    secure: true,
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  })
  return response
}
