import type { Server, Socket } from 'socket.io'
import {
  ClientEvents,
  ServerEvents,
  type ActionPayload,
  type JoinPayload,
  type RenamePayload,
} from '../../shared/events'
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

type SocketIdentity = { roomId: string; playerId: string }

const identities = new WeakMap<Socket, SocketIdentity>()

export function registerSocketHandlers(io: Server, deps: ServiceDeps): void {
  io.on('connection', (socket) => {
    socket.on(ClientEvents.JOIN, (payload: JoinPayload) => {
      if (typeof payload?.roomId !== 'string' || typeof payload?.playerId !== 'string') {
        emitError(socket, 'BAD_PAYLOAD', '请求格式不正确')
        return
      }
      const result = joinRoom(deps, payload)
      if (!handled(socket, result)) return
      identities.set(socket, { roomId: payload.roomId, playerId: payload.playerId })
      void socket.join(payload.roomId)
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.RENAME, (payload: RenamePayload) => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = renamePlayer(deps, { ...identity, name: String(payload?.name ?? '') })
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.START, () => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = startGame(deps, identity)
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on(ClientEvents.ACTION, (payload: ActionPayload) => {
      const identity = identities.get(socket)
      if (identity === undefined) return emitError(socket, 'NOT_IN_ROOM', '你还没有加入房间')
      const result = applyGameAction(deps, { ...identity, action: payload?.action })
      if (!handled(socket, result)) return
      broadcast(io, deps, result.value)
    })

    socket.on('disconnect', () => {
      const identity = identities.get(socket)
      if (identity === undefined) return
      identities.delete(socket)
      const result = markDisconnected(deps, identity)
      if (!result.ok) return
      broadcast(io, deps, result.value)
    })
  })
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
