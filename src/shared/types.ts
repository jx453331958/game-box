export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type PlayerPublic = {
  id: string
  name: string
  seat: number
  connected: boolean
}

/** What every member of a room may see. Never includes another player's private state. */
export type RoomPublic = {
  id: string
  inviteToken: string
  gameId: string
  gameName: string
  minPlayers: number
  maxPlayers: number
  hostId: string | null
  status: RoomStatus
  players: PlayerPublic[]
  winners: string[]
}
