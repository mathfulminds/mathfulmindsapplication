"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateMultiStepEquationsWithParenthesesInstance } from "@/lib/skills/multiStepEquationsWithParentheses";

export default function MultiStepEquationsWithParenthesesPage() {
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
        Multi-step equations (with parentheses)
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Distribute where needed, combine like terms where needed, then get
        the variable on the left and the constant on the right.
      </p>
      <StepSolver
        generate={generateMultiStepEquationsWithParenthesesInstance}
        skillName="Multi-step equations (with parentheses)"
      />
    </div>
  );
}
