"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateDecimalPercentInstance } from "@/lib/skills/decimalPercent";

export default function DecimalPercentEquationsPage() {
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
        Decimal and percent equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Solve equations with decimals, and rewrite percents as decimals
        before solving.
      </p>
      <StepSolver generate={generateDecimalPercentInstance} skillName="Decimal & percent equations" />
    </div>
  );
}
