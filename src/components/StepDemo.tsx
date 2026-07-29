'use client'

import { useState } from 'react'

type Step = {
  math: string[]
  question: string
  choices: string[]
  correct: number
  explanation: string
}

const steps: Step[] = [
  {
    math: ['11 − 12a = −97'],
    question: 'What operation undoes the "11 −" on the left?',
    choices: [
      'Subtract 11 from both sides',
      'Divide both sides by 11',
      'Add 12a to both sides',
    ],
    correct: 0,
    explanation: 'Undo addition by subtracting 11 from both sides.',
  },
  {
    math: ['11 − 12a = −97', '−11        −11', '−12a = −108'],
    question: 'What undoes multiplying a by −12?',
    choices: [
      'Multiply both sides by −12',
      'Divide both sides by −12',
      'Add −12 to both sides',
    ],
    correct: 1,
    explanation: 'Undo multiplication by dividing both sides by −12.',
  },
  {
    math: ['11 − 12a = −97', '−11        −11', '−12a = −108', '−12a/−12 = −108/−12'],
    question: 'What is the value of a?',
    choices: ['a = 9', 'a = −9', 'a = 96'],
    correct: 0,
    explanation: '−108 ÷ −12 = 9. A negative divided by a negative is positive.',
  },
]

export default function StepDemo() {
  const [stepIndex, setStepIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1
  const isCorrect = selected === step.correct

  function handleChoice(i: number) {
    if (revealed) return
    setSelected(i)
    if (i === step.correct) setRevealed(true)
  }

  function handleNext() {
    if (isLast) {
      setStepIndex(0)
    } else {
      setStepIndex(stepIndex + 1)
    }
    setSelected(null)
    setRevealed(false)
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
        border: '1px solid var(--line)',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--card)',
      }}
      className="step-demo"
    >
      {/* LEFT: math */}
      <div
        style={{
          padding: '32px 28px',
          borderRight: '1px solid var(--line)',
          fontFamily: 'var(--font-mono)',
          fontSize: 20,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
          minHeight: 260,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
            fontFamily: 'var(--font-body)',
            marginBottom: 10,
          }}
        >
          Solving two-step equations
        </div>
        {step.math.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre', color: 'var(--ink)' }}>
            {line}
          </div>
        ))}
        {revealed && (
          <div
            style={{
              marginTop: 14,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--green)',
              fontWeight: 600,
            }}
          >
            ✓ {step.explanation}
          </div>
        )}
      </div>

      {/* RIGHT: MCQ */}
      <div
        style={{
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          minHeight: 260,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
            marginBottom: 4,
          }}
        >
          Step {stepIndex + 1} of {steps.length}
        </div>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {step.question}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {step.choices.map((choice, i) => {
            const isSelected = selected === i
            const showWrong = isSelected && i !== step.correct
            const showRight = revealed && i === step.correct
            return (
              <button
                key={i}
                onClick={() => handleChoice(i)}
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${
                    showRight ? 'var(--green)' : showWrong ? 'var(--coral)' : 'var(--line)'
                  }`,
                  background: showRight
                    ? 'rgba(75,155,110,0.08)'
                    : showWrong
                    ? 'rgba(225,90,76,0.08)'
                    : 'var(--paper)',
                  cursor: revealed ? 'default' : 'pointer',
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                {choice}
              </button>
            )
          })}
        </div>
        {revealed && (
          <button
            onClick={handleNext}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              background: 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '9px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Try again' : 'Next step →'}
          </button>
        )}
      </div>
    </div>
  )
}
