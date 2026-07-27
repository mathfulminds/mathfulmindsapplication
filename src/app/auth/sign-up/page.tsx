'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Role = 'student' | 'parent' | 'teacher'

export default function SignUpPage() {
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        data: { full_name: fullName, role },
      },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
  }

  async function handleGoogleSignUp() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    })
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8 text-center">
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
          <p className="text-sm text-slate-500">
            Confirm your account to start using Mathful Minds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">
            <span className="text-slate-900">Mathful</span>{' '}
            <span className="text-sky-500">Minds</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Think Mathfully</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignUp}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 border border-slate-300 rounded-lg py-2.5 mb-4 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-xs text-slate-400">OR</span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        <form onSubmit={handleEmailSignUp} className="space-y-3">
          <input
            type="text"
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              I am a...
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="student">Student</option>
              <option value="parent">Parent / Guardian</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-sky-600 transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-5">
          Already have an account?{' '}
          <a href="/auth/sign-in" className="text-sky-500 font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
