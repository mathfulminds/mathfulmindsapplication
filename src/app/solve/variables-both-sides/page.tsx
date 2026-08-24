"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateVariablesBothSidesInstance } from "@/lib/skills/variablesBothSides";

export default function VariablesBothSidesPage() {
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
        Solving equations with variables on both sides
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        A good way to approach this type of question is to get the variable
        on the left hand side of the equation and the constant on the right
        side of the equation.
      </p>
      <StepSolver generate={generateVariablesBothSidesInstance} skillName="Variables on both sides" />
    </div>
  );
}
