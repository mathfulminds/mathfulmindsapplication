"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateAbsIneqInstance } from "@/lib/skills/absoluteValueInequalities";

export default function AbsoluteValueInequalitiesPage() {
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
        Absolute value inequalities
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Get the absolute value by itself, then split it into two inequalities -
        &ldquo;and&rdquo; for less than, &ldquo;or&rdquo; for greater than - and graph the answer.
      </p>
      <StepSolver generate={generateAbsIneqInstance} skillName="Absolute value inequalities" />
    </div>
  );
}
