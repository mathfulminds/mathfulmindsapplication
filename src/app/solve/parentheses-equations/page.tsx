"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateParenthesesEquationInstance } from "@/lib/skills/parenthesesEquations";

export default function ParenthesesEquationsPage() {
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
        Equations with parentheses
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Distribute first, then solve like a two-step equation. Every
        problem is randomly generated, so you can practice as many as you
        like.
      </p>
      <StepSolver generate={generateParenthesesEquationInstance} skillName="Equations with parentheses" />
    </div>
  );
}
