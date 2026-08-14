import { NextResponse } from 'next/server'
import { hasSession } from '@/server/auth/guards'
import { createRoom } from '@/server/rooms/service'
import { getServiceDeps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!(await hasSession())) {
    return NextResponse.json({ ok: false, message: '请先登录' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { gameId?: unknown } | null
  const gameId = typeof body?.gameId === 'string' ? body.gameId : ''
  const result = createRoom(getServiceDeps(), gameId)

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, roomId: result.value.id })
}
