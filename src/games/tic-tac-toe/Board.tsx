'use client'

import type { BoardProps } from '../types'
import type { TicTacToeAction, TicTacToeView } from './logic'

export default function TicTacToeBoard({
  view,
  onAction,
}: BoardProps<TicTacToeView, TicTacToeAction>) {
  const myTurn = view.currentMark !== null && view.currentMark === view.myMark
  const over = view.winner !== null || view.draw

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        你执 <span className="font-semibold text-slate-100">{view.myMark ?? '观战'}</span>
        {!over && (myTurn ? ' · 轮到你了' : ' · 等待对手落子')}
      </p>
      <div className="grid w-64 grid-cols-3 gap-1">
        {view.cells.map((cell, index) => (
          <button
            key={index}
            disabled={over || !myTurn || cell !== null}
            onClick={() => onAction({ type: 'place', cell: index })}
            className="flex h-20 w-20 items-center justify-center rounded bg-slate-800 text-3xl font-bold disabled:opacity-60"
          >
            {cell ?? ''}
          </button>
        ))}
      </div>
    </div>
  )
}
