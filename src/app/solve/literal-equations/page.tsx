"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateLiteralInstance } from "@/lib/skills/literalEquations";

export default function LiteralEquationsPage() {
  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          marginBottom: 8,
        }}
      >
        Literal equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Solve a formula for one of its letters, using the same steps as any
        other equation.
      </p>
      <StepSolver generate={generateLiteralInstance} skillName="Literal equations" />
    </div>
  );
}
