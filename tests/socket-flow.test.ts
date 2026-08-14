import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { io as connect, type Socket } from 'socket.io-client'
import { gameRegistry } from '../src/games/registry'
import type { TicTacToeView } from '../src/games/tic-tac-toe/logic'
import { createGameServer } from '../src/server/app'
import { createRoom, type ServiceDeps } from '../src/server/rooms/service'
import { createRoomStore } from '../src/server/rooms/store'
import { ClientEvents, ServerEvents, type ErrorPayload, type SyncPayload } from '../src/shared/events'

let server: Awaited<ReturnType<typeof createGameServer>>
let deps: ServiceDeps
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  deps = { store: createRoomStore(), games: gameRegistry, now: () => Date.now() }
  server = await createGameServer({ withNext: false, deps })
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve))
  const address = server.httpServer.address() as AddressInfo
  url = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await server.close()
})

function client(): Socket {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  return socket
}

function nextSync(socket: Socket): Promise<SyncPayload> {
  return new Promise((resolve) => socket.once(ServerEvents.SYNC, resolve))
}

function nextError(socket: Socket): Promise<ErrorPayload> {
  return new Promise((resolve) => socket.once(ServerEvents.ERROR, resolve))
}

function makeRoom(): string {
  const result = createRoom(deps, 'tic-tac-toe')
  if (!result.ok) throw new Error(result.message)
  return result.value.id
}

describe('socket flow', () => {
  it('syncs the room back to a joining player', async () => {
    const roomId = makeRoom()
    const socket = client()
    const sync = nextSync(socket)
    socket.emit(ClientEvents.JOIN, { roomId, playerId: 'p1', name: '小明' })
    const payload = await sync
    expect(payload.room.id).toBe(roomId)
    expect(payload.room.players).toHaveLength(1)
    expect(payload.room.players[0]!.name).toBe('小明')
    expect(payload.room.hostId).toBe('p1')
    expect(payload.gameView).toBeNull()
  })

  it('broadcasts the new roster to everyone in the room', async () => {
    const roomId = makeRoom()
    const host = client()
    const hostSync = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1', name: '小明' })
    await hostSync

    const hostSeesGuest = nextSync(host)
    const guest = client()
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2', name: '小红' })
    const payload = await hostSeesGuest
    expect(payload.room.players.map((player) => player.name)).toEqual(['小明', '小红'])
  })

  it('reports a missing room as an error rather than a sync', async () => {
    const socket = client()
    const error = nextError(socket)
    socket.emit(ClientEvents.JOIN, { roomId: 'NOPE12', playerId: 'p1' })
    expect(await error).toEqual({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' })
  })

  it('renames a player and broadcasts it', async () => {
    const roomId = makeRoom()
    const socket = client()
    const joined = nextSync(socket)
    socket.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await joined

    const renamed = nextSync(socket)
    socket.emit(ClientEvents.RENAME, { name: '新名字' })
    expect((await renamed).room.players[0]!.name).toBe('新名字')
  })

  it('lets the host start the game and gives each player their own view', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const hostStarted = nextSync(host)
    const guestStarted = nextSync(guest)
    host.emit(ClientEvents.START)
    const [hostPayload, guestPayload] = await Promise.all([hostStarted, guestStarted])

    expect(hostPayload.room.status).toBe('playing')
    const hostView = hostPayload.gameView as TicTacToeView
    const guestView = guestPayload.gameView as TicTacToeView
    expect(new Set([hostView.myMark, guestView.myMark])).toEqual(new Set(['X', 'O']))
  })

  it('rejects a start from a non-host', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const error = nextError(guest)
    guest.emit(ClientEvents.START)
    expect(await error).toEqual({ code: 'NOT_HOST', message: '只有房主可以开始游戏' })
  })

  it('sends an illegal move back only to the player who made it', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined
    const started = nextSync(host)
    host.emit(ClientEvents.START)
    const startPayload = await started

    const hostView = startPayload.gameView as TicTacToeView
    const waiting = hostView.myMark === 'X' ? guest : host
    const error = nextError(waiting)
    waiting.emit(ClientEvents.ACTION, { action: { type: 'place', cell: 0 } })
    expect(await error).toEqual({ code: 'INVALID_ACTION', message: '还没轮到你' })
  })

  it('marks a player offline when their socket drops', async () => {
    const roomId = makeRoom()
    const host = client()
    const guest = client()
    const hostJoined = nextSync(host)
    host.emit(ClientEvents.JOIN, { roomId, playerId: 'p1' })
    await hostJoined
    const guestJoined = nextSync(guest)
    guest.emit(ClientEvents.JOIN, { roomId, playerId: 'p2' })
    await guestJoined

    const hostNotified = nextSync(host)
    guest.close()
    const payload = await hostNotified
    expect(payload.room.players.find((player) => player.id === 'p2')!.connected).toBe(false)
  })
})
