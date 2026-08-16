"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateEliminationInstance } from "@/lib/skills/systemsElimination";

export default function SystemsEliminationPage() {
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
        Solving systems of equations: elimination
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Scale the equations so a variable cancels, add or subtract to
        eliminate it, solve for the remaining variable, then substitute
        back to find the other. Every problem is randomly generated, so
        you can practice as many as you like.
      </p>
      <StepSolver generate={() => generateEliminationInstance()} skillName="Systems of equations: elimination" />
    </div>
  );
}
