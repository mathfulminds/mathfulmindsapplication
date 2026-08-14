"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateParenthesesInequalityInstance } from "@/lib/skills/parenthesesInequalities";

export default function ParenthesesInequalitiesPage() {
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
        Inequalities with parentheses
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Distribute first - it never flips the sign - then solve like a
        two-step inequality, including whether the sign flips. Every
        problem is randomly generated, so you can practice as many as you
        like.
      </p>
      <StepSolver generate={generateParenthesesInequalityInstance} skillName="Inequalities with parentheses" />
    </div>
  );
}
