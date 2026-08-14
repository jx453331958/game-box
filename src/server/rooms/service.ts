import type { GameRegistry } from '../../games/registry'
import { generateInviteToken, generateRoomCode } from '../../shared/ids'
import type { PlayerPublic, RoomPublic } from '../../shared/types'
import type { Player, Room, RoomStore } from './store'

export type ServiceDeps = {
  store: RoomStore
  games: GameRegistry
  now: () => number
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

const NAME_MIN = 1
const NAME_MAX = 12

function fail(code: string, message: string): ServiceResult<never> {
  return { ok: false, code, message }
}

function touch(deps: ServiceDeps, room: Room): void {
  room.lastActivityAt = deps.now()
}

export function createRoom(deps: ServiceDeps, gameId: string): ServiceResult<Room> {
  const game = deps.games.get(gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')

  let id = generateRoomCode()
  while (deps.store.has(id)) id = generateRoomCode()

  const now = deps.now()
  const room: Room = {
    id,
    inviteToken: generateInviteToken(),
    gameId,
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: now,
    lastActivityAt: now,
  }
  deps.store.create(room)
  return { ok: true, value: room }
}

export function joinRoom(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string; name?: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')

  const existing = room.players.find((player) => player.id === params.playerId)
  if (existing !== undefined) {
    existing.connected = true
    touch(deps, room)
    return { ok: true, value: room }
  }

  if (room.status !== 'waiting') {
    return fail('GAME_ALREADY_STARTED', '对局已经开始，无法加入')
  }

  const game = deps.games.get(room.gameId)
  if (game === undefined) return fail('GAME_NOT_FOUND', '没有这个游戏')
  if (room.players.length >= game.meta.maxPlayers) return fail('ROOM_FULL', '房间已满')

  const seat = room.players.length
  const requested = (params.name ?? '').trim()
  const base = requested.length > 0 ? requested.slice(0, NAME_MAX) : `玩家${seat + 1}`
  const player: Player = {
    id: params.playerId,
    name: dedupeName(base, room.players),
    seat,
    connected: true,
    joinedAt: deps.now(),
  }
  room.players.push(player)
  if (room.hostId === null) room.hostId = player.id
  touch(deps, room)
  return { ok: true, value: room }
}

export function renamePlayer(
  deps: ServiceDeps,
  params: { roomId: string; playerId: string; name: string },
): ServiceResult<Room> {
  const room = deps.store.get(params.roomId)
  if (room === undefined) return fail('ROOM_NOT_FOUND', '房间不存在或已过期')

  const player = room.players.find((candidate) => candidate.id === params.playerId)
  if (player === undefined) return fail('NOT_IN_ROOM', '你不在这个房间里')

  const name = params.name.trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return fail('INVALID_NAME', `昵称需要 ${NAME_MIN} 到 ${NAME_MAX} 个字`)
  }

  const others = room.players.filter((candidate) => candidate.id !== params.playerId)
  player.name = dedupeName(name, others)
  touch(deps, room)
  return { ok: true, value: room }
}

export function toPublicRoom(deps: ServiceDeps, room: Room): RoomPublic {
  const game = deps.games.get(room.gameId)
  const players: PlayerPublic[] = room.players.map((player) => ({
    id: player.id,
    name: player.name,
    seat: player.seat,
    connected: player.connected,
  }))
  const winners =
    game !== undefined && room.status === 'finished' && room.gameState !== null
      ? game.isFinished(room.gameState).winners
      : []

  return {
    id: room.id,
    inviteToken: room.inviteToken,
    gameId: room.gameId,
    gameName: game?.meta.name ?? room.gameId,
    minPlayers: game?.meta.minPlayers ?? 0,
    maxPlayers: game?.meta.maxPlayers ?? 0,
    hostId: room.hostId,
    status: room.status,
    players,
    winners,
  }
}

function dedupeName(name: string, others: Player[]): string {
  const taken = new Set(others.map((player) => player.name))
  if (!taken.has(name)) return name
  let suffix = 2
  while (taken.has(`${name}${suffix}`)) suffix += 1
  return `${name}${suffix}`
}
