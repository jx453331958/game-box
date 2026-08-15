import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Game Box',
  description: '和朋友一起玩的线上桌游房间',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
      </body>
    </html>
  )
}
