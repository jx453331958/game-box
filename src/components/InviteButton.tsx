'use client'

import { useEffect, useState } from 'react'

export function InviteButton({ inviteToken }: { inviteToken: string }) {
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState('')

  // Computed after mount so server and client render the same initial markup
  // (avoids a hydration mismatch on window.location.origin).
  useEffect(() => {
    setLink(`${window.location.origin}/r/${inviteToken}`)
  }, [inviteToken])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void copy()}
        className="rounded bg-slate-700 px-3 py-2 text-sm font-medium"
      >
        {copied ? '已复制' : '邀请好友'}
      </button>
      <p className="break-all text-xs text-slate-500">{link}</p>
    </div>
  )
}
