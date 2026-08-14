import { RoomClient } from '@/components/RoomClient'
import { requireRoomAccess } from '@/server/auth/guards'
import { getRoomStore } from '@/server/runtime'

export const dynamic = 'force-dynamic'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  await requireRoomAccess(roomId)

  if (getRoomStore().get(roomId) === undefined) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-20 text-center">
        <h1 className="text-2xl font-semibold">房间不存在或已过期</h1>
        <p className="text-slate-400">房间可能已经解散，找房主重新建一个吧。</p>
      </main>
    )
  }

  return <RoomClient roomId={roomId} />
}
