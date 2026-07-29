import Image from 'next/image'
import StepDemo from '@/components/StepDemo'

const inputOptions = [
  {
    title: 'Type it',
    body: 'Use a friendly equation builder to type any expression, formula, or word problem.',
    color: 'var(--blue)',
  },
  {
    title: 'Upload it',
    body: 'Drop in a screenshot or photo of your homework — worksheets, textbook pages, or graphs.',
    color: 'var(--coral)',
  },
  {
    title: 'Snap it',
    body: 'Use your camera to capture a problem right from the page in front of you.',
    color: 'var(--green)',
  },
]

export default function HomePage() {
  return (
    <div>
      {/* HERO */}
      <section
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '56px 24px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <Image
          src="/logo.png"
          alt="Mathful Minds"
          width={420}
          height={346}
          priority
          style={{ width: '100%', maxWidth: 420, height: 'auto' }}
        />
        <p
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 18,
            color: 'var(--ink-soft)',
          }}
        >
          Think Mathfully
        </p>
      </section>

      {/* INPUT OPTIONS */}
      <section
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 24px 56px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {inputOptions.map((opt) => (
          <div
            key={opt.title}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '22px 18px',
              borderTop: `3px solid ${opt.color}`,
            }}
          >
            <h3
              style={{
                margin: '0 0 6px',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 19,
              }}
            >
              {opt.title}
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              {opt.body}
            </p>
          </div>
        ))}
      </section>

      {/* SIGNATURE DEMO */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 64px' }}>
        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
            marginBottom: 14,
            fontFamily: 'var(--font-body)',
          }}
        >
          See it in action — answer each step to reveal the next
        </p>
        <StepDemo />
      </section>

      {/* DUAL AUDIENCE */}
      <section
        style={{
          background: 'var(--card)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          padding: '56px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 40,
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, marginBottom: 12 }}>
              For Students
            </h2>
            <ul style={{ paddingLeft: 18, color: 'var(--ink-soft)', lineHeight: 1.8, fontSize: 14.5 }}>
              <li>Instant feedback at every step of the problem.</li>
              <li>Find the key numbers, words, and phrases first.</li>
              <li>A two-column layout that&apos;s easy to follow.</li>
              <li>Concise, teacher-made solutions.</li>
            </ul>
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, marginBottom: 12 }}>
              For Teachers &amp; Parents
            </h2>
            <ul style={{ paddingLeft: 18, color: 'var(--ink-soft)', lineHeight: 1.8, fontSize: 14.5 }}>
              <li>A virtual tutor for any homework question.</li>
              <li>Saves time and frustration.</li>
              <li>Teacher-made solutions students understand.</li>
              <li>Peace of mind — AI as a learning tool, not a shortcut.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer
        style={{
          textAlign: 'center',
          padding: '28px 24px',
          fontSize: 12.5,
          color: 'var(--ink-soft)',
        }}
      >
        © {new Date().getFullYear()} Mathful Minds
      </footer>
    </div>
  )
}
