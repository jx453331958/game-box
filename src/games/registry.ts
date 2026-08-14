import { ticTacToe } from './tic-tac-toe/logic'
import type { GameLogic, GameMeta } from './types'

export type GameRegistry = {
  get(id: string): GameLogic | undefined
  list(): GameMeta[]
}

const ALL: GameLogic[] = [ticTacToe as GameLogic]

export const gameRegistry: GameRegistry = {
  get(id) {
    return ALL.find((game) => game.meta.id === id)
  },
  list() {
    return ALL.map((game) => game.meta)
  },
}
