import type { RoomStatus } from '../../shared/types'

export type { RoomStatus }

export type Player = {
  id: string
  name: string
  seat: number
  connected: boolean
  joinedAt: number
}

export type Room = {
  /** 6-char code, safe to read aloud. */
  id: string
  /** 21-char secret; only ever appears in invite links. */
  inviteToken: string
  gameId: string
  hostId: string | null
  players: Player[]
  status: RoomStatus
  /** Opaque to this layer — owned by the game's GameLogic. */
  gameState: unknown
  seed: string
  createdAt: number
  lastActivityAt: number
}

export type RoomStore = {
  create(room: Room): void
  get(id: string): Room | undefined
  getByInviteToken(token: string): Room | undefined
  has(id: string): boolean
  list(): Room[]
  delete(id: string): void
}

export function createRoomStore(): RoomStore {
  const rooms = new Map<string, Room>()
  const byToken = new Map<string, string>()

  return {
    create(room) {
      rooms.set(room.id, room)
      byToken.set(room.inviteToken, room.id)
    },
    get(id) {
      return rooms.get(id)
    },
    getByInviteToken(token) {
      const id = byToken.get(token)
      return id === undefined ? undefined : rooms.get(id)
    },
    has(id) {
      return rooms.has(id)
    },
    list() {
      return [...rooms.values()]
    },
    delete(id) {
      const room = rooms.get(id)
      if (room === undefined) return
      byToken.delete(room.inviteToken)
      rooms.delete(id)
    },
  }
}
