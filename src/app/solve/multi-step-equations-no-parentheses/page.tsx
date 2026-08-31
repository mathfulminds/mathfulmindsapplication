"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateMultiStepEquationsNoParenthesesInstance } from "@/lib/skills/multiStepEquationsNoParentheses";

export default function MultiStepEquationsNoParenthesesPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          marginBottom: 8,
        }}
      >
        Multi-step equations (no parentheses)
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Combine like terms on either or both sides - they don&apos;t have to
        sit next to each other - then get the variable on the left and the
        constant on the right.
      </p>
      <StepSolver
        generate={generateMultiStepEquationsNoParenthesesInstance}
        skillName="Multi-step equations (no parentheses)"
      />
    </div>
  );
}
