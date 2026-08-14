import { NextResponse } from 'next/server'
import { getConfig } from '@/server/runtime'
import { createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/server/auth/tokens'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const config = getConfig()

  if (!passwordMatches(password, config.password)) {
    return NextResponse.json({ ok: false, message: '密码不对' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(Date.now(), config.sessionSecret),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  })
  return response
}
