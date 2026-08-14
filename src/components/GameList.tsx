'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GameMeta } from '@/games/types'

export function GameList({ games }: { games: GameMeta[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createRoom(gameId: string) {
    setPendingId(gameId)
    setError(null)
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId }),
    })
    const body = (await response.json().catch(() => null)) as
      | { ok: true; roomId: string }
      | { ok: false; message: string }
      | null
    setPendingId(null)
    if (body === null || !body.ok) {
      setError(body?.message ?? '创建房间失败')
      return
    }
    router.push(`/room/${body.roomId}`)
  }

  if (games.length === 0) {
    return <p className="text-slate-400">还没有可玩的游戏。</p>
  }

  return (
    <div className="space-y-3">
      {error !== null && <p className="text-sm text-red-400">{error}</p>}
      {games.map((game) => (
        <div
          key={game.id}
          className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 p-4"
        >
          <div>
            <h2 className="font-medium">{game.name}</h2>
            <p className="text-sm text-slate-400">{game.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {game.minPlayers === game.maxPlayers
                ? `${game.minPlayers} 人`
                : `${game.minPlayers}-${game.maxPlayers} 人`}
            </p>
          </div>
          <button
            onClick={() => void createRoom(game.id)}
            disabled={pendingId !== null}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {pendingId === game.id ? '创建中…' : '创建房间'}
          </button>
        </div>
      ))}
    </div>
  )
}
