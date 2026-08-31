"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateCombiningLikeTermsInstance } from "@/lib/skills/combiningLikeTerms";

export default function CombiningLikeTermsPage() {
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
        Combining like terms
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Before you can isolate the variable, combine any like terms on the
        same side of the equation into one.
      </p>
      <StepSolver generate={generateCombiningLikeTermsInstance} skillName="Combining like terms" />
    </div>
  );
}
