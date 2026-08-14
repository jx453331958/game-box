'use client'

import { useEffect, useRef, useState } from 'react'

/** Keeps enough of the token visible to tell two links apart, and no more. */
function maskLink(link: string, token: string): string {
  if (link === '' || token.length <= 8) return link
  const masked = `${token.slice(0, 4)}${'•'.repeat(6)}${token.slice(-4)}`
  return link.replace(token, masked)
}

export function InviteButton({ inviteToken }: { inviteToken: string }) {
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Computed after mount so server and client render the same initial markup
  // (avoids a hydration mismatch on window.location.origin).
  useEffect(() => {
    setLink(`${window.location.origin}/r/${inviteToken}`)
  }, [inviteToken])

  async function copy() {
    setCopyFailed(false)
    try {
      // navigator.clipboard is undefined on a plain-HTTP origin, which is a real
      // case here: the app runs behind a proxy that may terminate TLS elsewhere.
      if (navigator.clipboard === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fall back to showing the link so it can be copied by hand.
      setCopied(false)
      setCopyFailed(true)
      setRevealed(true)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => void copy()}
          className="rounded bg-slate-700 px-3 py-2 text-sm font-medium"
        >
          {copied ? '已复制' : '邀请好友'}
        </button>
        <button
          onClick={() => setRevealed((current) => !current)}
          className="text-xs text-slate-500 underline underline-offset-2"
        >
          {revealed ? '隐藏链接' : '显示链接'}
        </button>
      </div>

      {copyFailed && (
        <p className="text-xs text-amber-400">复制失败，请手动复制下面的链接发给朋友。</p>
      )}

      {/* The token is the room's only secret — anyone holding this link can walk
          in, so it stays off screen (and out of screenshots) until asked for. */}
      {revealed ? (
        <input
          ref={inputRef}
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
          aria-label="邀请链接"
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300 outline-none"
        />
      ) : (
        <p className="break-all font-mono text-xs text-slate-600">{maskLink(link, inviteToken)}</p>
      )}
    </div>
  )
}
