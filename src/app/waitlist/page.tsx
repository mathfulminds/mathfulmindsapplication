import type { Metadata } from 'next'
import Image from 'next/image'
import WaitlistForm from './WaitlistForm'
import WaitlistDemo from './WaitlistDemo'

export const metadata: Metadata = {
  title: 'Join the Beta — Mathful Minds',
  description:
    'Think Mathfully. Master math with clear, step-by-step solutions made by real teachers. Join the Mathful Minds beta waitlist.',
}

export default function WaitlistPage() {
  return (
    <div>
      {/* HERO */}
      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '40px 24px 36px',
          textAlign: 'center',
        }}
      >
        <Image
          src="/logo.png"
          alt="Mathful Minds"
          width={420}
          height={346}
          priority
          style={{ display: 'block', width: '100%', maxWidth: 280, height: 'auto', margin: '0 auto 24px' }}
        />
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--coral)',
          }}
        >
          Beta coming soon
        </p>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(32px, 6vw, 48px)',
            lineHeight: 1.1,
            color: 'var(--ink)',
          }}
        >
          <span style={{ color: 'var(--blue)' }}>Think Mathfully.</span>{' '}
          Master math with teacher-made solutions.
        </h1>
        <p
          style={{
            margin: '18px auto 0',
            maxWidth: 560,
            fontSize: 17,
            lineHeight: 1.55,
            color: 'var(--ink-soft)',
          }}
        >
          Using AI the right way! Every solution is{' '}
          <strong style={{ fontWeight: 800, color: 'var(--green)', whiteSpace: 'nowrap' }}>
            teacher verified <span aria-hidden="true">✓</span>
          </strong>
          . Students work through each question one step at a time!
        </p>
      </section>

      {/* WAITLIST FORM */}
      <section style={{ maxWidth: 560, margin: '0 auto', padding: '0 24px 56px' }}>
        <WaitlistForm />
      </section>

      {/* LIVE DEMO */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 72px' }}>
        <p
          style={{
            textAlign: 'center',
            maxWidth: 620,
            margin: '0 auto 18px',
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.55,
            color: 'var(--ink-soft)',
          }}
        >
          See it in action — answer each step to reveal the next step.
        </p>
        <WaitlistDemo />
      </section>
    </div>
  )
}
