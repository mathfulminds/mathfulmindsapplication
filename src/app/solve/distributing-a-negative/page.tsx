"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateDistributeNegativeInstance } from "@/lib/skills/distributeNegative";

export default function DistributingANegativePage() {
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
        Distributing a negative
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        A minus sign in front of parentheses changes the sign of every term
        inside. Distribute the negative, then solve.
      </p>
      <StepSolver generate={generateDistributeNegativeInstance} skillName="Distributing a negative" />
    </div>
  );
}
