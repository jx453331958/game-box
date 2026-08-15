import type { BoardComponent } from './types'
import TicTacToeBoard from './tic-tac-toe/Board'

/**
 * Client-side counterpart of registry.ts. Add one line per new game.
 *
 * Each board is typed for its own view and action, so registering it is where
 * that type is erased — the one cast in the whole seam.
 */
export const boardRegistry: Record<string, BoardComponent> = {
  'tic-tac-toe': TicTacToeBoard as BoardComponent,
}
