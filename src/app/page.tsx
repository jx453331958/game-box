import { GameList } from '@/components/GameList'
import { gameRegistry } from '@/games/registry'
import { requireSession } from '@/server/auth/guards'

export const dynamic = 'force-dynamic'

export default async function LobbyPage() {
  await requireSession()

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">选一个游戏</h1>
        <p className="text-sm text-slate-400">创建房间后把邀请链接发给朋友即可开局。</p>
      </header>
      <GameList games={gameRegistry.list()} />
    </main>
  )
}
