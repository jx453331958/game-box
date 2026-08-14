import { createRng, shuffle } from '../../shared/rng'
import type { ActionResult, FinishResult, GameLogic, PlayerRef } from '../types'

export type Mark = 'X' | 'O'

export type TicTacToeState = {
  /** 9 cells, each holding the playerId that claimed it. */
  board: (string | null)[]
  marks: Record<string, Mark>
  /** playerIds in turn order; index 0 moves first and plays X. */
  order: string[]
  turn: number
  winner: string | null
  draw: boolean
}

export type TicTacToeAction = { type: 'place'; cell: number }

export type TicTacToeView = {
  cells: (Mark | null)[]
  myMark: Mark | null
  currentPlayerId: string | null
  currentMark: Mark | null
  winner: string | null
  draw: boolean
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export const ticTacToe: GameLogic<TicTacToeState, TicTacToeAction> = {
  meta: {
    id: 'tic-tac-toe',
    name: '井字棋',
    description: '经典三连棋，两人对弈，先连成一条线者获胜。',
    minPlayers: 2,
    maxPlayers: 2,
  },

  createInitialState(players: PlayerRef[], seed: string): TicTacToeState {
    const order = shuffle(
      [...players].sort((a, b) => a.seat - b.seat).map((p) => p.id),
      createRng(seed),
    )
    const marks: Record<string, Mark> = {}
    order.forEach((id, index) => {
      marks[id] = index === 0 ? 'X' : 'O'
    })
    return { board: Array(9).fill(null), marks, order, turn: 0, winner: null, draw: false }
  },

  applyAction(state, playerId, action): ActionResult<TicTacToeState> {
    if (state.winner !== null || state.draw) return { ok: false, reason: '对局已经结束了' }
    if (!state.order.includes(playerId)) return { ok: false, reason: '你不在这局游戏里' }
    if (state.order[state.turn] !== playerId) return { ok: false, reason: '还没轮到你' }
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell > 8) {
      return { ok: false, reason: '非法的格子' }
    }
    if (state.board[action.cell] !== null) return { ok: false, reason: '这个格子已经有人下了' }

    const board = [...state.board]
    board[action.cell] = playerId
    const winner = findWinner(board)
    const draw = winner === null && board.every((cell) => cell !== null)

    return {
      ok: true,
      state: {
        ...state,
        board,
        winner,
        draw,
        turn: winner !== null || draw ? state.turn : (state.turn + 1) % state.order.length,
      },
    }
  },

  getViewFor(state, playerId): TicTacToeView {
    const currentPlayerId =
      state.winner !== null || state.draw ? null : (state.order[state.turn] ?? null)
    return {
      cells: state.board.map((owner) => (owner === null ? null : (state.marks[owner] ?? null))),
      myMark: state.marks[playerId] ?? null,
      currentPlayerId,
      currentMark: currentPlayerId === null ? null : (state.marks[currentPlayerId] ?? null),
      winner: state.winner,
      draw: state.draw,
    }
  },

  isFinished(state): FinishResult {
    if (state.winner !== null) return { finished: true, winners: [state.winner] }
    if (state.draw) return { finished: true, winners: [] }
    return { finished: false, winners: [] }
  },
}

function findWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of LINES) {
    const owner = board[a!]
    if (owner !== null && owner !== undefined && owner === board[b!] && owner === board[c!]) {
      return owner
    }
  }
  return null
}
