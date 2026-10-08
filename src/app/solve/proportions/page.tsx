"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateProportionInstance } from "@/lib/skills/proportions";

export default function ProportionsPage() {
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
        Solving proportions
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Two equal ratios with one number missing. Cross multiply, then solve
        for the variable.
      </p>
      <StepSolver generate={generateProportionInstance} skillName="Proportions" />
    </div>
  );
}
