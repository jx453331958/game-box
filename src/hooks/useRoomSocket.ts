'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/lib/playerId'
import {
  ClientEvents,
  ServerEvents,
  type ErrorPayload,
  type SyncPayload,
} from '@/shared/events'
import type { RoomPublic } from '@/shared/types'

export type RoomSocket = {
  playerId: string
  room: RoomPublic | null
  gameView: unknown | null
  error: ErrorPayload | null
  connected: boolean
  rename: (name: string) => void
  start: () => void
  act: (action: unknown) => void
}

export function useRoomSocket(roomId: string): RoomSocket {
  const socketRef = useRef<Socket | null>(null)
  const [playerId, setPlayerId] = useState('')
  const [room, setRoom] = useState<RoomPublic | null>(null)
  const [gameView, setGameView] = useState<unknown | null>(null)
  const [error, setError] = useState<ErrorPayload | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const id = getOrCreatePlayerId()
    setPlayerId(id)

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket

    // Re-join on every connect so a reconnect restores the seat automatically.
    socket.on('connect', () => {
      setConnected(true)
      socket.emit(ClientEvents.JOIN, { roomId, playerId: id })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on(ServerEvents.SYNC, (payload: SyncPayload) => {
      setRoom(payload.room)
      setGameView(payload.gameView)
      setError(null)
    })
    socket.on(ServerEvents.ERROR, (payload: ErrorPayload) => setError(payload))

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomId])

  const rename = useCallback((name: string) => {
    socketRef.current?.emit(ClientEvents.RENAME, { name })
  }, [])

  const start = useCallback(() => {
    socketRef.current?.emit(ClientEvents.START)
  }, [])

  const act = useCallback((action: unknown) => {
    socketRef.current?.emit(ClientEvents.ACTION, { action })
  }, [])

  return { playerId, room, gameView, error, connected, rename, start, act }
}
