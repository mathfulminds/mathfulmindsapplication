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
        The goal is to get the variable alone and on the left side. You
        should undo the operation on the side of the variable. You may have
        to flip the sign during this process as well.
      </p>
      <StepSolver generate={generateOneStepInequalityInstance} skillName="One-step inequalities" />
    </div>
  );
}
