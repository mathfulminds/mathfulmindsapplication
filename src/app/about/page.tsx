export default function AboutPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 80px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 34, marginBottom: 18 }}>
        About Mathful Minds
      </h1>
      <p style={{ fontSize: 16.5, lineHeight: 1.7, color: 'var(--ink-soft)' }}>
        Mathful Minds is an AI homework helper designed to facilitate student
        learning instead of just giving students the answers to questions. AI
        has immersed itself into our daily lives, so teaching students how to
        use it properly is vital.
      </p>

      <h2
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 22,
          marginTop: 40,
          marginBottom: 14,
        }}
      >
        Why Mathful Minds is the best math AI for students
      </h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 15.5, color: 'var(--ink-soft)' }}>
        <li>Provides instant feedback at every step of the problem.</li>
        <li>
          Emphasizes finding the important numbers, words, and phrases to
          solve each problem.
        </li>
        <li>
          Uses a two-column approach that&apos;s simple to follow — math on
          the left, prompts on the right.
        </li>
        <li>Uses concise teacher-made solutions that are easy to understand.</li>
      </ul>

      <h2
        style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 22,
          marginTop: 32,
          marginBottom: 14,
        }}
      >
        Why it&apos;s the best choice for teachers &amp; parents
      </h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 15.5, color: 'var(--ink-soft)' }}>
        <li>Provides students with a virtual tutor for any homework question.</li>
        <li>Saves time and frustration.</li>
        <li>Uses teacher-made, concise solutions that students understand.</li>
        <li>
          Provides peace of mind that students are using AI as a resource to
          learn, not a website to copy answers from.
        </li>
      </ul>
    </div>
  )
}
