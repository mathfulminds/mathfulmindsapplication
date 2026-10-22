"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateBothSidesInequalityInstance } from "@/lib/skills/variablesBothSidesInequalities";

export default function VariablesBothSidesInequalitiesPage() {
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
        Inequalities with variables on both sides
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Move the variable terms to one side and the numbers to the other,
        watching for when the inequality sign flips.
      </p>
      <StepSolver generate={generateBothSidesInequalityInstance} skillName="Inequalities with variables on both sides" />
    </div>
  );
}
