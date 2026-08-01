"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateFractionInstance } from "@/lib/skills/fractionalCoefficients";

export default function FractionalCoefficientsPage() {
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
        Equations with fractional coefficients
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Answer each step correctly to reveal the next line. This skill uses
        the multiply-by-the-reciprocal technique to isolate the variable.
      </p>
      <StepSolver
        generate={generateFractionInstance}
        skillName="Fractional coefficients"
      />
    </div>
  );
}
