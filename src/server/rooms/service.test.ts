import { beforeEach, describe, expect, it } from 'vitest'
import { gameRegistry } from '../../games/registry'
import { createRoomStore } from './store'
import {
  applyGameAction,
  createRoom,
  joinRoom,
  markDisconnected,
  renamePlayer,
  startGame,
  toPublicRoom,
  viewFor,
  type ServiceDeps,
} from './service'
import type { TicTacToeState, TicTacToeView } from '../../games/tic-tac-toe/logic'

let clock = 1000
let deps: ServiceDeps

beforeEach(() => {
  clock = 1000
  deps = { store: createRoomStore(), games: gameRegistry, now: () => clock }
})

function newRoomId(): string {
  const result = createRoom(deps, 'tic-tac-toe')
  if (!result.ok) throw new Error(result.message)
  return result.value.id
}

describe('createRoom', () => {
  it('creates a waiting room with an invite token and no players', () => {
    const result = createRoom(deps, 'tic-tac-toe')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('waiting')
    expect(result.value.players).toEqual([])
    expect(result.value.hostId).toBeNull()
    expect(result.value.id).toHaveLength(6)
    expect(result.value.inviteToken).toHaveLength(21)
    expect(deps.store.get(result.value.id)).toBeDefined()
  })

  it('rejects an unknown game', () => {
    const result = createRoom(deps, 'no-such-game')
    expect(result).toEqual({ ok: false, code: 'GAME_NOT_FOUND', message: '没有这个游戏' })
  })

  it('gives each room a distinct id and token', () => {
    const ids = new Set(Array.from({ length: 50 }, newRoomId))
    expect(ids.size).toBe(50)
  })
})

describe('joinRoom', () => {
  it('seats the first player as host with a default name', () => {
    const roomId = newRoomId()
    const result = joinRoom(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p1')
    expect(result.value.players).toEqual([
      { id: 'p1', name: '玩家1', seat: 0, connected: true, joinedAt: 1000 },
    ])
  })

  it('seats a second player with the next seat and default name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = joinRoom(deps, { roomId, playerId: 'p2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]).toMatchObject({ id: 'p2', name: '玩家2', seat: 1 })
    expect(result.value.hostId).toBe('p1')
  })

  it('accepts a supplied name', () => {
    const roomId = newRoomId()
    const result = joinRoom(deps, { roomId, playerId: 'p1', name: '  小明  ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小明')
  })

  it('deduplicates a colliding name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const result = joinRoom(deps, { roomId, playerId: 'p2', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]!.name).toBe('小明2')
  })

  it('treats a repeat join as a reconnect keeping seat and name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const room = deps.store.get(roomId)!
    room.players[0]!.connected = false
    clock = 2000
    const result = joinRoom(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players).toHaveLength(1)
    expect(result.value.players[0]).toMatchObject({ name: '小明', seat: 0, connected: true })
  })

  it('rejects joining a full room', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    joinRoom(deps, { roomId, playerId: 'p2' })
    const result = joinRoom(deps, { roomId, playerId: 'p3' })
    expect(result).toEqual({ ok: false, code: 'ROOM_FULL', message: '房间已满' })
  })

  it('rejects a new player once the game has started', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    deps.store.get(roomId)!.status = 'playing'
    const result = joinRoom(deps, { roomId, playerId: 'p2' })
    expect(result).toEqual({
      ok: false,
      code: 'GAME_ALREADY_STARTED',
      message: '对局已经开始，无法加入',
    })
  })

  it('still lets an existing player reconnect after the game has started', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    deps.store.get(roomId)!.status = 'playing'
    expect(joinRoom(deps, { roomId, playerId: 'p1' }).ok).toBe(true)
  })

  it('rejects an unknown room', () => {
    const result = joinRoom(deps, { roomId: 'NOPE12', playerId: 'p1' })
    expect(result).toEqual({ ok: false, code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' })
  })

  it('refreshes lastActivityAt', () => {
    const roomId = newRoomId()
    clock = 5000
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(deps.store.get(roomId)!.lastActivityAt).toBe(5000)
  })
})

describe('renamePlayer', () => {
  it('renames the player', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: '  小红 ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小红')
  })

  it('rejects an empty name', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(renamePlayer(deps, { roomId, playerId: 'p1', name: '   ' })).toEqual({
      ok: false,
      code: 'INVALID_NAME',
      message: '昵称需要 1 到 12 个字',
    })
  })

  it('rejects a name longer than 12 characters', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: 'a'.repeat(13) })
    expect(result).toEqual({ ok: false, code: 'INVALID_NAME', message: '昵称需要 1 到 12 个字' })
  })

  it('deduplicates against other players', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    joinRoom(deps, { roomId, playerId: 'p2' })
    const result = renamePlayer(deps, { roomId, playerId: 'p2', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[1]!.name).toBe('小明2')
  })

  it('lets a player keep their own name unchanged', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const result = renamePlayer(deps, { roomId, playerId: 'p1', name: '小明' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players[0]!.name).toBe('小明')
  })

  it('rejects a player who is not in the room', () => {
    const roomId = newRoomId()
    expect(renamePlayer(deps, { roomId, playerId: 'ghost', name: '幽灵' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('toPublicRoom', () => {
  it('projects the room with game metadata and no game state', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
    const view = toPublicRoom(deps, deps.store.get(roomId)!)
    expect(view).toEqual({
      id: roomId,
      inviteToken: deps.store.get(roomId)!.inviteToken,
      gameId: 'tic-tac-toe',
      gameName: '井字棋',
      minPlayers: 2,
      maxPlayers: 2,
      hostId: 'p1',
      status: 'waiting',
      players: [{ id: 'p1', name: '小明', seat: 0, connected: true }],
      winners: [],
    })
  })
})

function seatedRoom(): string {
  const roomId = newRoomId()
  joinRoom(deps, { roomId, playerId: 'p1', name: '小明' })
  joinRoom(deps, { roomId, playerId: 'p2', name: '小红' })
  return roomId
}

describe('startGame', () => {
  it('starts the game and seeds the initial state', () => {
    const roomId = seatedRoom()
    const result = startGame(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('playing')
    expect(result.value.seed).not.toBe('')
    const state = result.value.gameState as TicTacToeState
    expect(state.board).toEqual(Array(9).fill(null))
  })

  it('rejects a non-host', () => {
    const roomId = seatedRoom()
    expect(startGame(deps, { roomId, playerId: 'p2' })).toEqual({
      ok: false,
      code: 'NOT_HOST',
      message: '只有房主可以开始游戏',
    })
  })

  it('rejects too few players', () => {
    const roomId = newRoomId()
    joinRoom(deps, { roomId, playerId: 'p1' })
    expect(startGame(deps, { roomId, playerId: 'p1' })).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_PLAYERS',
      message: '人数不够，至少需要 2 人',
    })
  })

  it('rejects starting a game that is already running', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    expect(startGame(deps, { roomId, playerId: 'p1' })).toEqual({
      ok: false,
      code: 'NOT_WAITING',
      message: '对局已经开始了',
    })
  })

  it('rejects an unknown room', () => {
    expect(startGame(deps, { roomId: 'NOPE12', playerId: 'p1' })).toEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
      message: '房间不存在或已过期',
    })
  })
})

describe('applyGameAction', () => {
  function currentPlayer(roomId: string): string {
    const state = deps.store.get(roomId)!.gameState as TicTacToeState
    return state.order[state.turn]!
  }

  it('applies a legal move', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const mover = currentPlayer(roomId)
    const result = applyGameAction(deps, { roomId, playerId: mover, action: { type: 'place', cell: 4 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value.gameState as TicTacToeState).board[4]).toBe(mover)
  })

  it('passes the game layer rejection through as INVALID_ACTION', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const waiting = currentPlayer(roomId) === 'p1' ? 'p2' : 'p1'
    expect(applyGameAction(deps, { roomId, playerId: waiting, action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      message: '还没轮到你',
    })
  })

  it('marks the room finished once the game ends', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const x = currentPlayer(roomId)
    const o = x === 'p1' ? 'p2' : 'p1'
    for (const [player, cell] of [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]] as const) {
      const result = applyGameAction(deps, { roomId, playerId: player, action: { type: 'place', cell } })
      expect(result.ok).toBe(true)
    }
    const room = deps.store.get(roomId)!
    expect(room.status).toBe('finished')
    expect(toPublicRoom(deps, room).winners).toEqual([x])
  })

  it('rejects an action while the room is still waiting', () => {
    const roomId = seatedRoom()
    expect(applyGameAction(deps, { roomId, playerId: 'p1', action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'NOT_PLAYING',
      message: '对局还没有开始',
    })
  })

  it('rejects a player who is not in the room', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    expect(applyGameAction(deps, { roomId, playerId: 'ghost', action: { type: 'place', cell: 0 } })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('markDisconnected', () => {
  it('keeps the seat and flips connected to false', () => {
    const roomId = seatedRoom()
    const result = markDisconnected(deps, { roomId, playerId: 'p2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.players).toHaveLength(2)
    expect(result.value.players[1]).toMatchObject({ id: 'p2', connected: false, seat: 1 })
  })

  it('transfers the host to the next connected player', () => {
    const roomId = seatedRoom()
    const result = markDisconnected(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p2')
  })

  it('keeps the host when nobody else is connected', () => {
    const roomId = seatedRoom()
    markDisconnected(deps, { roomId, playerId: 'p2' })
    const result = markDisconnected(deps, { roomId, playerId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hostId).toBe('p1')
  })

  it('ignores a player who is not in the room', () => {
    const roomId = seatedRoom()
    expect(markDisconnected(deps, { roomId, playerId: 'ghost' })).toEqual({
      ok: false,
      code: 'NOT_IN_ROOM',
      message: '你不在这个房间里',
    })
  })
})

describe('viewFor', () => {
  it('returns null before the game starts', () => {
    const roomId = seatedRoom()
    expect(viewFor(deps, deps.store.get(roomId)!, 'p1')).toBeNull()
  })

  it('returns the per-player view once playing', () => {
    const roomId = seatedRoom()
    startGame(deps, { roomId, playerId: 'p1' })
    const view = viewFor(deps, deps.store.get(roomId)!, 'p1') as TicTacToeView
    expect(view.cells).toHaveLength(9)
    expect(['X', 'O']).toContain(view.myMark)
  })
})
