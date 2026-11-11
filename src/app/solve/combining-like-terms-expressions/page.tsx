"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateExpressionInstance } from "@/lib/skills/combiningExpressions";

export default function CombiningLikeTermsExpressionsPage() {
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
        Combining like terms
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Mark each set of like terms with its own shape, then combine each set to simplify the expression.
      </p>
      <StepSolver generate={generateExpressionInstance} skillName="Combining like terms" />
    </div>
  );
}
