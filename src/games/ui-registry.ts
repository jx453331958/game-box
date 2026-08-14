import type { ComponentType } from 'react'
import type { BoardProps } from './types'
import TicTacToeBoard from './tic-tac-toe/Board'

/** Client-side counterpart of registry.ts. Add one line per new game. */
export const boardRegistry: Record<string, ComponentType<BoardProps<never, never>>> = {
  'tic-tac-toe': TicTacToeBoard as unknown as ComponentType<BoardProps<never, never>>,
}
