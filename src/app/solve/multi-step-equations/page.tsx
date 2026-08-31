"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateMultiStepEquationsInstance } from "@/lib/skills/multiStepEquations";

export default function MultiStepEquationsPage() {
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
        Multi-step equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Put it all together: distribute where needed, combine like terms
        where needed, then get the variable on the left and the constant on
        the right.
      </p>
      <StepSolver generate={generateMultiStepEquationsInstance} skillName="Multi-step equations" />
    </div>
  );
}
