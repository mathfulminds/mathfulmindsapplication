'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

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
  // Phone/tablet menu: below 1024px the tabs and sign-in buttons don't fit
  // beside the logo (they made every page scroll sideways), so they
  // collapse behind a menu button instead.
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      className="site-header"
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
        <style>{`
          .nav-burger { display: none; }
          .nav-mobile-panel { display: none; }
          @media (max-width: 1023px) {
            .nav-tabs, .nav-auth { display: none !important; }
            .nav-burger { display: inline-flex; }
            .nav-mobile-panel.open { display: block; }
          }
        `}</style>
        <nav className="nav-tabs" style={{ display: 'flex', gap: 8, justifySelf: 'center' }}>
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
        <div className="nav-auth" style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'end' }}>
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
        <button
          type="button"
          className="nav-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            gridColumn: 3,
            justifySelf: 'end',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: menuOpen ? 'var(--paper)' : 'var(--card)',
            color: 'var(--ink)',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      <div
        id="mobile-menu"
        className={`nav-mobile-panel${menuOpen ? ' open' : ''}`}
        style={{ borderTop: '1px solid var(--line)', background: 'var(--card)', padding: '10px 16px 16px' }}
      >
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 700,
                  fontSize: 16,
                  padding: '12px 14px',
                  borderRadius: 10,
                  color: active ? '#fff' : 'var(--ink)',
                  background: active ? 'var(--blue)' : 'transparent',
                }}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <Link
            href="/auth/sign-in"
            onClick={() => setMenuOpen(false)}
            style={{
              flex: 1,
              textAlign: 'center',
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 999,
              padding: '11px 16px',
            }}
          >
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            onClick={() => setMenuOpen(false)}
            style={{
              flex: 1,
              textAlign: 'center',
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 15,
              color: '#fff',
              background: 'var(--blue)',
              borderRadius: 999,
              padding: '11px 16px',
            }}
          >
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  )
}
