import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { io as connect, type Socket } from 'socket.io-client'
import { gameRegistry } from '../src/games/registry'
import type { TicTacToeView } from '../src/games/tic-tac-toe/logic'
import { createGameServer } from '../src/server/app'
import { createRoom, type ServiceDeps } from '../src/server/rooms/service'
import { createRoomStore } from '../src/server/rooms/store'
import { ClientEvents, ServerEvents, type SyncPayload } from '../src/shared/events'

let server: Awaited<ReturnType<typeof createGameServer>>
let deps: ServiceDeps
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  deps = { store: createRoomStore(), games: gameRegistry, now: () => Date.now() }
  server = await createGameServer({ withNext: false, deps })
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve))
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`
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

async function join(socket: Socket, roomId: string, playerId: string, name: string): Promise<SyncPayload> {
  const sync = nextSync(socket)
  socket.emit(ClientEvents.JOIN, { roomId, playerId, name })
  return sync
}

describe('full game over the wire', () => {
  it('plays a room from creation to a winner, surviving a reconnect', async () => {
    const created = createRoom(deps, 'tic-tac-toe')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const roomId = created.value.id

    // 1. Two players join through the same room id an invite link would resolve to.
    //    The host must also drain its own copy of the broadcast the guest's join
    //    triggers (every socket in the room gets a SYNC, not just the actor), so it
    //    can't be mistaken for a later sync.
    const host = client()
    let guest = client()
    await join(host, roomId, 'p1', '小明')
    const hostSeesGuestJoin = nextSync(host)
    const guestJoined = await join(guest, roomId, 'p2', '小红')
    expect(guestJoined.room.players.map((player) => player.name)).toEqual(['小明', '小红'])
    expect((await hostSeesGuestJoin).room.players.map((player) => player.name)).toEqual(['小明', '小红'])

    // 2. The guest renames themselves and everyone sees it — including the guest's own
    //    echo of the broadcast, which must be drained here so it can't be mistaken for
    //    a later sync (the server broadcasts to every socket in the room, actor included).
    const hostSeesRename = nextSync(host)
    const guestSeesOwnRename = nextSync(guest)
    guest.emit(ClientEvents.RENAME, { name: '小花' })
    expect((await hostSeesRename).room.players[1]!.name).toBe('小花')
    await guestSeesOwnRename

    // 3. The host starts the game.
    const hostStarted = nextSync(host)
    const guestStarted = nextSync(guest)
    host.emit(ClientEvents.START)
    const [hostStart, guestStart] = await Promise.all([hostStarted, guestStarted])
    expect(hostStart.room.status).toBe('playing')

    const hostIsX = (hostStart.gameView as TicTacToeView).myMark === 'X'
    expect((guestStart.gameView as TicTacToeView).myMark).toBe(hostIsX ? 'O' : 'X')

    // 4. X takes cells 0,1,2 while O answers on 3,4 — X wins on the top row.
    const xSocket = hostIsX ? host : guest
    const oSocket = hostIsX ? guest : host
    const xId = hostIsX ? 'p1' : 'p2'

    // Every move broadcasts to both sockets in the room, not just the mover, so both
    // copies must be drained before the next move registers a fresh listener — otherwise
    // a still-in-flight spectator copy from this move could be mistaken for the response
    // to the next one.
    async function move(mover: Socket, spectator: Socket, cell: number): Promise<SyncPayload> {
      const moverSync = nextSync(mover)
      const spectatorSync = nextSync(spectator)
      mover.emit(ClientEvents.ACTION, { action: { type: 'place', cell } })
      const [moverPayload] = await Promise.all([moverSync, spectatorSync])
      return moverPayload
    }

    await move(xSocket, oSocket, 0)
    await move(oSocket, xSocket, 3)
    await move(xSocket, oSocket, 1)
    await move(oSocket, xSocket, 4)
    const final = await move(xSocket, oSocket, 2)

    expect(final.room.status).toBe('finished')
    expect(final.room.winners).toEqual([xId])

    // 5. The guest drops and comes back with the same playerId — same seat, same name,
    //    and the finished board is replayed to them.
    const hostSeesDrop = nextSync(host)
    guest.close()
    expect((await hostSeesDrop).room.players.find((p) => p.id === 'p2')!.connected).toBe(false)

    guest = client()
    const rejoined = await join(guest, roomId, 'p2', 'ignored-on-reconnect')
    expect(rejoined.room.players.find((p) => p.id === 'p2')).toMatchObject({
      name: '小花',
      seat: 1,
      connected: true,
    })
    expect(rejoined.room.status).toBe('finished')
    const rejoinedView = rejoined.gameView as TicTacToeView
    expect(rejoinedView.cells.filter((cell) => cell !== null)).toHaveLength(5)
  })
})
