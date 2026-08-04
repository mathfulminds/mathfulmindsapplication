"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateOneStepInequalityInstance } from "@/lib/skills/oneStepInequalities";

export default function OneStepInequalitiesPage() {
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
        Solving one-step inequalities
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Answer each step correctly to reveal the next line, including whether
        the inequality sign flips. Every problem is randomly generated, so
        you can practice as many as you like.
      </p>
      <StepSolver generate={generateOneStepInequalityInstance} skillName="One-step inequalities" />
    </div>
  );
}
