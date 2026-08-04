"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateFractionalCoefficientsInequalityInstance } from "@/lib/skills/fractionalCoefficientsInequalities";

export default function FractionalCoefficientsInequalitiesPage() {
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
        Inequalities with fractional coefficients
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Isolate the variable by multiplying by the reciprocal, then decide
        whether the inequality sign flips. Every problem is randomly
        generated, so you can practice as many as you like.
      </p>
      <StepSolver
        generate={generateFractionalCoefficientsInequalityInstance}
        skillName="Inequalities with fractional coefficients"
      />
    </div>
  );
}
