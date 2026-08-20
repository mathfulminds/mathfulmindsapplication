"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateSubstitutionInstanceTwoTrack } from "@/lib/skills/systemsSubstitutionHorizontal";

// The two-track layout: Equation 1 (blue) always stays on the left,
// Equation 2 (red) always stays on the right - which side does the
// isolating vs. the substituting/solving depends on which equation
// happens to be isolated, not a fixed left/right split. This is now
// the primary substitution page; the original single-column layout is
// still available at /solve/systems-substitution-vertical.
export default function SystemsSubstitutionPage() {
  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 16px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          marginBottom: 8,
        }}
      >
        Solving systems of equations: substitution
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Equation 1 is blue on the left, Equation 2 is red on the right.
        The goal is to isolate, substitute, and solve.
      </p>
      <StepSolver generate={() => generateSubstitutionInstanceTwoTrack()} skillName="Systems of equations: substitution" />
    </div>
  );
}
