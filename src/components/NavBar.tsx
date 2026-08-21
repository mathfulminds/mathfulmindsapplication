'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/skills', label: 'Skills' },
  { href: '/students', label: 'Students' },
  { href: '/parents', label: 'Parents' },
  { href: '/teachers-schools', label: 'Teachers / Schools' },
  { href: '/about', label: 'About Us' },
  { href: '/history', label: 'History' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--card)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 12,
          padding: '12px 24px',
        }}
      >
        {/* Logo — links home */}
        <Link
          href="/"
          aria-label="Mathful Minds home"
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', justifySelf: 'start' }}
        >
          <Image src="/logo.png" alt="" width={140} height={120} style={{ height: 40, width: 'auto' }} />
        </Link>

        {/* Nav tabs — the middle grid column is auto-width and the two
            outer columns are equal (1fr each), which is what keeps this
            group truly centered on the page regardless of how wide the
            logo or auth buttons on either side happen to be. */}
        <nav style={{ display: 'flex', gap: 8, justifySelf: 'center' }}>
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '0.02em',
                  padding: '8px 18px',
                  borderRadius: 999,
                  color: active ? '#fff' : 'var(--ink)',
                  background: active ? 'var(--blue)' : 'transparent',
                  transition: 'background 0.15s ease, color 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {/* Auth buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'end' }}>
          <Link
            href="/auth/sign-in"
            style={{
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 14,
              color: 'var(--ink)',
              padding: '9px 16px',
            }}
          >
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            style={{
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 14,
              color: '#fff',
              background: 'var(--blue)',
              borderRadius: 999,
              padding: '9px 18px',
            }}
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  )
}
