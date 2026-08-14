import type { ComponentType } from 'react'

export type PlayerRef = { id: string; name: string; seat: number }

export type GameMeta = {
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; reason: string }

export type FinishResult = { finished: boolean; winners: string[] }

/**
 * Every game is pure: no clock, no network, no ambient randomness.
 * Randomness must derive from the injected `seed`.
 */
export interface GameLogic<S = unknown, A = unknown> {
  meta: GameMeta
  createInitialState(players: PlayerRef[], seed: string): S
  applyAction(state: S, playerId: string, action: A): ActionResult<S>
  /** Server calls this per player; hidden information must be stripped here. */
  getViewFor(state: S, playerId: string): unknown
  isFinished(state: S): FinishResult
}

export type BoardProps<V = unknown, A = unknown> = {
  view: V
  me: string
  onAction: (action: A) => void
}

export type BoardComponent = ComponentType<BoardProps<never, never>>
