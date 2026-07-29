import type { Metadata } from 'next'
import './globals.css'
import NavBar from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Mathful Minds — Think Mathfully',
  description:
    'An AI homework helper that teaches instead of just giving answers. Step-by-step, multiple-choice guided math practice.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  )
}
