export default function HistoryPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px 80px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, marginBottom: 10 }}>
        History
      </h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 32 }}>
        Every problem you&apos;ve worked through will show up here, with
        search and filters by description, category, and time.
      </p>

      <div
        style={{
          border: '1px dashed var(--line)',
          borderRadius: 14,
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--ink-soft)',
          background: 'var(--card)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14.5 }}>
          No problems yet. Once the solver is live, questions you enter will
          appear here automatically.
        </p>
      </div>
    </div>
  )
}
