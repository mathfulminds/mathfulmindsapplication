"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateSlipPractice } from "@/lib/skills/quadraticsSetup";

export default function QuadraticsSlipSlidePage() {
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
        Quadratics by factoring (ax² + bx + c)
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Slip the first number over to the last one, factor what you get, then slide it back -
        divide, reduce, bottoms up - and solve both factors.
      </p>
      <StepSolver generate={generateSlipPractice} skillName="Quadratics by factoring (ax² + bx + c)" />
    </div>
  );
}
