"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateAbsInstance } from "@/lib/skills/absoluteValue";

export default function AbsoluteValueEquationsPage() {
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
        Absolute value equations
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Get the absolute value by itself, then split it into two equations -
        one for each direction from 0.
      </p>
      <StepSolver generate={generateAbsInstance} skillName="Absolute value equations" />
    </div>
  );
}
