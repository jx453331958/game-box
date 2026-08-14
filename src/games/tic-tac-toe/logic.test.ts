import { describe, expect, it } from 'vitest'
import type { PlayerRef } from '../types'
import { ticTacToe, type TicTacToeState, type TicTacToeView } from './logic'

const players: PlayerRef[] = [
  { id: 'p1', name: '小明', seat: 0 },
  { id: 'p2', name: '小红', seat: 1 },
]

function start(seed = 'seed-1'): TicTacToeState {
  return ticTacToe.createInitialState(players, seed)
}

function place(state: TicTacToeState, playerId: string, cell: number): TicTacToeState {
  const result = ticTacToe.applyAction(state, playerId, { type: 'place', cell })
  if (!result.ok) throw new Error(`unexpected rejection: ${result.reason}`)
  return result.state
}

function firstPlayer(state: TicTacToeState): string {
  return state.order[0]!
}

function secondPlayer(state: TicTacToeState): string {
  return state.order[1]!
}

describe('createInitialState', () => {
  it('starts with an empty board and both players seated', () => {
    const state = start()
    expect(state.board).toEqual(Array(9).fill(null))
    expect(state.order).toHaveLength(2)
    expect(new Set(state.order)).toEqual(new Set(['p1', 'p2']))
    expect(state.winner).toBeNull()
    expect(state.draw).toBe(false)
  })

  it('gives X to whoever moves first', () => {
    const state = start()
    expect(state.marks[firstPlayer(state)]).toBe('X')
    expect(state.marks[secondPlayer(state)]).toBe('O')
  })

  it('is reproducible for the same seed', () => {
    expect(start('same').order).toEqual(start('same').order)
  })
})

describe('applyAction', () => {
  it('places a mark and passes the turn', () => {
    const state = place(start(), firstPlayer(start()), 4)
    expect(state.board[4]).toBe(firstPlayer(state))
    expect(state.turn).toBe(1)
  })

  it('rejects a move out of turn', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, secondPlayer(state), { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '还没轮到你' })
  })

  it('rejects an occupied cell', () => {
    let state = start()
    state = place(state, firstPlayer(state), 0)
    const result = ticTacToe.applyAction(state, secondPlayer(state), { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '这个格子已经有人下了' })
  })

  it('rejects an out-of-range cell', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, firstPlayer(state), { type: 'place', cell: 9 })
    expect(result).toEqual({ ok: false, reason: '非法的格子' })
  })

  it('rejects a player who is not in the game', () => {
    const state = start()
    const result = ticTacToe.applyAction(state, 'stranger', { type: 'place', cell: 0 })
    expect(result).toEqual({ ok: false, reason: '你不在这局游戏里' })
  })

  it('detects a row win', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 3)
    state = place(state, x, 1)
    state = place(state, o, 4)
    state = place(state, x, 2)
    expect(state.winner).toBe(x)
    expect(ticTacToe.isFinished(state)).toEqual({ finished: true, winners: [x] })
  })

  it('detects a diagonal win', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 1)
    state = place(state, x, 4)
    state = place(state, o, 2)
    state = place(state, x, 8)
    expect(state.winner).toBe(x)
  })

  it('detects a draw', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    for (const [player, cell] of [
      [x, 0],
      [o, 1],
      [x, 2],
      [o, 4],
      [x, 3],
      [o, 5],
      [x, 7],
      [o, 6],
      [x, 8],
    ] as const) {
      state = place(state, player as string, cell as number)
    }
    expect(state.winner).toBeNull()
    expect(state.draw).toBe(true)
    expect(ticTacToe.isFinished(state)).toEqual({ finished: true, winners: [] })
  })

  it('rejects any move after the game is over', () => {
    let state = start()
    const [x, o] = [firstPlayer(state), secondPlayer(state)]
    state = place(state, x, 0)
    state = place(state, o, 3)
    state = place(state, x, 1)
    state = place(state, o, 4)
    state = place(state, x, 2)
    const result = ticTacToe.applyAction(state, o, { type: 'place', cell: 5 })
    expect(result).toEqual({ ok: false, reason: '对局已经结束了' })
  })

  it('does not mutate the previous state', () => {
    const state = start()
    place(state, firstPlayer(state), 0)
    expect(state.board).toEqual(Array(9).fill(null))
  })
})

describe('getViewFor', () => {
  it('exposes marks rather than player ids', () => {
    let state = start()
    const x = firstPlayer(state)
    state = place(state, x, 4)
    const view = ticTacToe.getViewFor(state, x) as TicTacToeView
    expect(view.cells[4]).toBe('X')
    expect(view.myMark).toBe('X')
    expect(view.currentMark).toBe('O')
    expect(JSON.stringify(view)).not.toContain('board')
  })

  it('reports no mark for an observer who is not seated', () => {
    const view = ticTacToe.getViewFor(start(), 'stranger') as TicTacToeView
    expect(view.myMark).toBeNull()
  })
})

describe('isFinished', () => {
  it('reports an unfinished game', () => {
    expect(ticTacToe.isFinished(start())).toEqual({ finished: false, winners: [] })
  })
})
