import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/waitlist  { email: string }
// Adds an email to the beta waitlist (public.waitlist, see
// supabase/migrations/0004_waitlist.sql). Signing up twice is treated as
// success, so the form never tells a visitor whether an email is already on it.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let email: unknown
  try {
    ;({ email } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof email !== 'string') {
    return NextResponse.json({ error: 'Please enter an email address.' }, { status: 400 })
  }
  const normalized = email.trim().toLowerCase()
  if (normalized.length > 254 || !EMAIL.test(normalized)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || key === 'YOUR_ANON_KEY_HERE') {
    console.error('Waitlist: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set in .env.local.')
    return NextResponse.json({ error: 'Sign-ups are unavailable right now.' }, { status: 503 })
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await supabase.from('waitlist').insert({ email: normalized })

  // 23505 = unique_violation: already on the list.
  if (error && error.code !== '23505') {
    console.error('Waitlist insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
