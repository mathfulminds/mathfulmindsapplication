'use client'

import { useState } from 'react'

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus({ kind: 'sending' })
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus({ kind: 'error', message: data.error ?? 'Something went wrong. Please try again.' })
        return
      }
      setStatus({ kind: 'done' })
    } catch {
      setStatus({ kind: 'error', message: 'Could not reach the server. Please try again.' })
    }
  }

  if (status.kind === 'done') {
    return (
      <div
        role="status"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderTop: '3px solid var(--green)',
          borderRadius: 14,
          padding: '22px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--green)' }}>
          You&apos;re on the list!
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>
          We&apos;ll email you as soon as the beta opens.
        </p>
      </div>
    )
  }

  const sending = status.kind === 'sending'

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderTop: '3px solid var(--blue)',
        borderRadius: 14,
        padding: '22px 20px',
      }}
    >
      <label
        htmlFor="waitlist-email"
        style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, marginBottom: 4 }}
      >
        Join the beta waitlist
      </label>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        Be first in line when Mathful Minds opens to students, parents, and teachers.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status.kind === 'error') setStatus({ kind: 'idle' })
          }}
          aria-invalid={status.kind === 'error'}
          aria-describedby={status.kind === 'error' ? 'waitlist-error' : undefined}
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            padding: '12px 14px',
            fontSize: 15,
            fontFamily: 'var(--font-body)',
            color: 'var(--ink)',
            background: 'var(--paper)',
            border: `1px solid ${status.kind === 'error' ? 'var(--coral)' : 'var(--line)'}`,
            borderRadius: 10,
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            flex: '0 0 auto',
            padding: '12px 20px',
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            background: sending ? 'var(--ink-soft)' : 'var(--blue)',
            border: 'none',
            borderRadius: 10,
            cursor: sending ? 'default' : 'pointer',
          }}
        >
          {sending ? 'Joining…' : 'Join the waitlist'}
        </button>
      </div>
      {status.kind === 'error' && (
        <p id="waitlist-error" role="alert" style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--coral)' }}>
          {status.message}
        </p>
      )}
    </form>
  )
}
