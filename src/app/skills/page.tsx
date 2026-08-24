import Link from 'next/link'

interface Skill {
  title: string
  description: string
  href: string
}

interface SkillGroup {
  label: string
  color: string
  skills: Skill[]
}

const groups: SkillGroup[] = [
  {
    label: 'Equations',
    color: 'var(--blue)',
    skills: [
      { title: 'One-Step Equations', description: 'Undo a single operation to isolate the variable.', href: '/solve/one-step-equations' },
      { title: 'Two-Step Equations', description: 'Undo two operations, one at a time.', href: '/solve/two-step-equations' },
      { title: 'Equations with Parentheses', description: 'Distribute first, then solve.', href: '/solve/parentheses-equations' },
      { title: 'Fractional Coefficients', description: 'Solve equations where the variable has a fractional coefficient.', href: '/solve/fractional-coefficients' },
      { title: 'Non-Integer Solutions', description: 'Practice equations whose answers aren\u2019t whole numbers.', href: '/solve/non-integer-solutions' },
      { title: 'Variables on Both Sides', description: 'Collect the variable terms before isolating it.', href: '/solve/variables-both-sides' },
      { title: 'Variables Both Sides Infinite or No Solutions', description: 'Recognize when an equation has no solution or infinitely many.', href: '/solve/variables-both-sides-infinite-or-no-solutions' },
    ],
  },
  {
    label: 'Inequalities',
    color: 'var(--coral)',
    skills: [
      { title: 'One-Step Inequalities', description: 'Undo a single operation, watching for sign flips.', href: '/solve/one-step-inequalities' },
      { title: 'Two-Step Inequalities', description: 'Undo two operations to isolate the variable.', href: '/solve/two-step-inequalities' },
      { title: 'Inequalities with Parentheses', description: 'Distribute first, then solve the inequality.', href: '/solve/parentheses-inequalities' },
      { title: 'Fractional Coefficients', description: 'Solve inequalities where the variable has a fractional coefficient.', href: '/solve/fractional-coefficients-inequalities' },
      { title: 'Non-Integer Inequalities', description: 'Practice inequalities whose answers aren\u2019t whole numbers.', href: '/solve/non-integer-inequalities' },
    ],
  },
  {
    label: 'Systems of Equations',
    color: 'var(--green)',
    skills: [
      { title: 'Substitution', description: 'Isolate a variable in one equation, then substitute it into the other.', href: '/solve/systems-substitution' },
      { title: 'Elimination', description: 'Scale and combine equations to cancel out a variable.', href: '/solve/systems-elimination' },
    ],
  },
]

export default function SkillsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 30,
          marginBottom: 8,
        }}
      >
        Skills
      </h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 40 }}>
        Pick a skill to start practicing. Every problem is randomly generated, so you can
        practice as many as you like.
      </p>

      {groups.map((group) => (
        <section key={group.label} style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 20,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: group.color,
              }}
            />
            {group.label}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {group.skills.map((skill) => (
              <Link
                key={skill.href}
                href={skill.href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: '22px 18px',
                  borderTop: `3px solid ${group.color}`,
                  display: 'block',
                  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 6px',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  {skill.title}
                </h3>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  {skill.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
