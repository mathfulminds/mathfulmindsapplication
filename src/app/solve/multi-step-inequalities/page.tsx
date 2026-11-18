"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateMultiStepInequalityInstance } from "@/lib/skills/linearGeneral";

export default function MultiStepInequalitiesPage() {
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
        Multi-step inequalities
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Answer each step correctly to reveal the next line. Distribute and
        combine like terms first, then solve - watching for sign flips - and
        graph the answer.
      </p>
      <StepSolver
        generate={generateMultiStepInequalityInstance}
        skillName="Multi-step inequalities"
      />
    </div>
  );
}
