import type { RoomPublic } from './types'

export const ClientEvents = {
  JOIN: 'room:join',
  RENAME: 'room:rename',
  START: 'game:start',
  ACTION: 'game:action',
} as const

export const ServerEvents = {
  SYNC: 'room:sync',
  ERROR: 'room:error',
} as const

export type JoinPayload = { roomId: string; playerId: string; name?: string }
export type RenamePayload = { name: string }
export type ActionPayload = { action: unknown }

export type SyncPayload = { room: RoomPublic; gameView: unknown | null }
export type ErrorPayload = { code: string; message: string }
