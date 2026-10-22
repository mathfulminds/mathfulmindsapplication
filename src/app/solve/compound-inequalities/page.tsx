"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateCompoundInequalityInstance } from "@/lib/skills/compoundInequalities";

export default function CompoundInequalitiesPage() {
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
        Compound inequalities
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Solve &ldquo;and&rdquo; and &ldquo;or&rdquo; inequalities, then graph both
        endpoints on a number line.
      </p>
      <StepSolver generate={generateCompoundInequalityInstance} skillName="Compound inequalities" />
    </div>
  );
}
