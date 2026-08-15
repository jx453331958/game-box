'use client'

import { useState } from 'react'
import { InviteButton } from '@/components/InviteButton'
import { boardRegistry } from '@/games/ui-registry'
import { useRoomSocket } from '@/hooks/useRoomSocket'

export function RoomClient({ roomId }: { roomId: string }) {
  const { playerId, room, gameView, error, connected, rename, start, act } = useRoomSocket(roomId)
  const [draftName, setDraftName] = useState('')

  if (room === null) {
    return (
      <p className="text-slate-400">
        {error !== null ? error.message : connected ? '正在加入房间…' : '正在连接…'}
      </p>
    )
  }

  const me = room.players.find((player) => player.id === playerId)
  const isHost = room.hostId === playerId
  const Board = boardRegistry[room.gameId]
  const enoughPlayers = room.players.length >= room.minPlayers

  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{room.gameName}</h1>
        <p className="text-sm text-slate-400">
          房间号 <span className="font-mono text-slate-200">{room.id}</span>
          {!connected && <span className="ml-2 text-amber-400">连接已断开，正在重连…</span>}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-400">玩家（{room.players.length}/{room.maxPlayers}）</h2>
        <ul className="space-y-1">
          {room.players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 text-sm">
              <span>{player.name}</span>
              {player.id === room.hostId && <span className="text-xs text-emerald-400">房主</span>}
              {player.id === playerId && <span className="text-xs text-slate-500">（你）</span>}
              {!player.connected && <span className="text-xs text-amber-400">掉线中</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-slate-500">修改昵称</label>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder={me?.name ?? ''}
            maxLength={12}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-slate-400"
          />
        </div>
        <button
          onClick={() => {
            rename(draftName)
            setDraftName('')
          }}
          disabled={draftName.trim() === ''}
          className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40"
        >
          保存
        </button>
        <InviteButton inviteToken={room.inviteToken} />
      </section>

      {error !== null && <p className="text-sm text-red-400">{error.message}</p>}

      {room.status === 'waiting' && (
        <section className="space-y-2">
          {isHost ? (
            <button
              onClick={start}
              disabled={!enoughPlayers}
              className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-40"
            >
              开始游戏
            </button>
          ) : (
            <p className="text-sm text-slate-400">等房主开始游戏…</p>
          )}
          {!enoughPlayers && (
            <p className="text-xs text-slate-500">还差 {room.minPlayers - room.players.length} 人才能开始</p>
          )}
        </section>
      )}

      {room.status !== 'waiting' && Board !== undefined && gameView !== null && (
        <section className="space-y-4">
          <Board view={gameView} me={playerId} onAction={act} />
          {room.status === 'finished' && (
            <p className="text-lg font-medium">
              {room.winners.length === 0
                ? '平局！'
                : `${room.players.find((player) => player.id === room.winners[0])?.name ?? '有人'} 获胜！`}
            </p>
          )}
        </section>
      )}
    </main>
  )
}
