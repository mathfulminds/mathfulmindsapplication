"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateFactorInstance } from "@/lib/skills/quadraticsFactoring";

export default function QuadraticsFactoringPage() {
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
        Quadratics by factoring
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        List the factor pairs of the last number, find the pair that adds to the middle one,
        choose the signs, then solve both factors.
      </p>
      <StepSolver generate={generateFactorInstance} skillName="Quadratics by factoring" />
    </div>
  );
}
