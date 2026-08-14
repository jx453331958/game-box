import type { Server, Socket } from 'socket.io'
import { ClientEvents, ServerEvents, type JoinPayload } from '../../shared/events'
import {
  applyGameAction,
  joinRoom,
  markDisconnected,
  renamePlayer,
  startGame,
  toPublicRoom,
  viewFor,
  type ServiceDeps,
  type ServiceResult,
} from '../rooms/service'
import type { Room } from '../rooms/store'
import { authorizedRoomId } from './auth'

type SocketIdentity = { roomId: string; playerId: string }

const identities = new WeakMap<Socket, SocketIdentity>()

const BAD_PAYLOAD_MESSAGE = '请求格式不正确'

export function registerSocketHandlers(io: Server, deps: ServiceDeps): void {
  io.on('connection', (socket) => {
    socket.on(ClientEvents.JOIN, (payload: unknown) => {
      guarded(socket, ClientEvents.JOIN, () => {
        const join = parseJoin(payload)
        if (join === null) return emitError(socket, 'BAD_PAYLOAD', BAD_PAYLOAD_MESSAGE)

        // The handshake was authorised for exactly one room. Trusting the room
        // id claimed here instead would make the middleware no protection at all.
        const authorized = authorizedRoomId(socket)
        if (authorized === undefined || authorized !== join.roomId) {
          return emitError(socket, 'FORBIDDEN', '你没有权限进入这个房间')
        }

        const result = joinRoom(deps, join)
        if (!handled(socket, result)) return
        identities.set(socket, { roomId: join.roomId, playerId: join.playerId })
        void socket.join(join.roomId)
        broadcast(io, deps, result.value)
      })
    })

    socket.on(ClientEvents.RENAME, (payload: unknown) => {
      guarded(socket, ClientEvents.RENAME, () => {
        const identity = identities.get(socket)
        if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
        const name = parseName(payload)
        if (name === null) return emitError(socket, 'BAD_PAYLOAD', BAD_PAYLOAD_MESSAGE)
        const result = renamePlayer(deps, { ...identity, name })
        if (!handled(socket, result)) return
        broadcast(io, deps, result.value)
      })
    })

    socket.on(ClientEvents.START, () => {
      guarded(socket, ClientEvents.START, () => {
        const identity = identities.get(socket)
        if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
        const result = startGame(deps, identity)
        if (!handled(socket, result)) return
        broadcast(io, deps, result.value)
      })
    })

    socket.on(ClientEvents.ACTION, (payload: unknown) => {
      guarded(socket, ClientEvents.ACTION, () => {
        const identity = identities.get(socket)
        if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
        const action = parseAction(payload)
        if (action === null) return emitError(socket, 'BAD_PAYLOAD', BAD_PAYLOAD_MESSAGE)
        const result = applyGameAction(deps, { ...identity, action })
        if (!handled(socket, result)) return
        broadcast(io, deps, result.value)
      })
    })

    socket.on('disconnect', () => {
      guarded(socket, 'disconnect', () => {
        const identity = identities.get(socket)
        if (identity === undefined) return
        identities.delete(socket)
        const result = markDisconnected(deps, identity)
        if (!result.ok) return
        broadcast(io, deps, result.value)
      })
    })
  })
}

/**
 * Socket.IO does not catch exceptions thrown inside an event listener: one
 * uncaught TypeError from a malformed packet takes the whole process down, and
 * with it every room and every in-flight game. The transport boundary is where
 * we refuse to die for a bad packet — it also covers whatever a future game's
 * `applyAction` forgets to check.
 */
function guarded(socket: Socket, event: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.error(`[socket] handler for ${event} threw`, error)
    emitError(socket, 'INTERNAL', '服务器开小差了，请稍后重试')
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseJoin(payload: unknown): JoinPayload | null {
  if (!isObject(payload)) return null
  const { roomId, playerId, name } = payload
  if (typeof roomId !== 'string' || typeof playerId !== 'string') return null
  if (name !== undefined && typeof name !== 'string') return null
  return name === undefined ? { roomId, playerId } : { roomId, playerId, name }
}

function parseName(payload: unknown): string | null {
  if (!isObject(payload)) return null
  const { name } = payload
  return typeof name === 'string' ? name : null
}

/** Returns the action object, or null when the packet cannot carry one. */
function parseAction(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null
  const { action } = payload
  return isObject(action) ? action : null
}

/** Emits the per-player view to every socket currently in the room. */
function broadcast(io: Server, deps: ServiceDeps, room: Room): void {
  const publicRoom = toPublicRoom(deps, room)
  for (const socket of io.sockets.sockets.values()) {
    const identity = identities.get(socket)
    if (identity === undefined || identity.roomId !== room.id) continue
    socket.emit(ServerEvents.SYNC, {
      room: publicRoom,
      gameView: viewFor(deps, room, identity.playerId),
    })
  }
}

function handled<T>(socket: Socket, result: ServiceResult<T>): result is { ok: true; value: T } {
  if (result.ok) return true
  emitError(socket, result.code, result.message)
  return false
}

function emitError(socket: Socket, code: string, message: string): void {
  socket.emit(ServerEvents.ERROR, { code, message })
}
