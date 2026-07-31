"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateOneStepInstance } from "@/lib/skills/oneStepEquations";

export default function OneStepEquationsPage() {
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
        Solving one-step equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Answer the step correctly to reveal the answer. Every problem is
        randomly generated, so you can practice as many as you like.
      </p>
      <StepSolver generate={generateOneStepInstance} skillName="One-step equations" />
    </div>
  );
}
