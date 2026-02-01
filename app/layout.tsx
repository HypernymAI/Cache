import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cache',
  description: 'Self-improving agent memory system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
