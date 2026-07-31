"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateTwoStepInstance } from "@/lib/skills/twoStepEquations";

export default function TwoStepEquationsPage() {
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
        Solving two-step equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Answer each step correctly to reveal the next line. Every problem is
        randomly generated, so you can practice as many as you like.
      </p>
      <StepSolver generate={generateTwoStepInstance} skillName="Two-step equations" />
    </div>
  );
}
