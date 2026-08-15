import { NextResponse } from 'next/server'
import { createGrantValue, grantCookieName, GRANT_MAX_AGE_MS } from '@/server/auth/tokens'
import { getConfig, getRoomStore } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const room = getRoomStore().getByInviteToken(token)

  if (room === undefined) {
    return NextResponse.redirect(new URL('/invalid-invite', request.url))
  }

  const response = NextResponse.redirect(new URL(`/room/${room.id}`, request.url))
  response.cookies.set({
    name: grantCookieName(room.id),
    value: createGrantValue(room.id, Date.now(), getConfig().sessionSecret),
    httpOnly: true,
    sameSite: 'lax',
    // See the note in src/app/api/login/route.ts: the browser-facing origin is
    // HTTPS, and http://localhost is exempt from the Secure requirement.
    secure: true,
    path: '/',
    maxAge: Math.floor(GRANT_MAX_AGE_MS / 1000),
  })
  return response
}
