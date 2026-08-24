"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateVariablesBothSidesInfiniteOrNoSolutionsInstance } from "@/lib/skills/variablesBothSidesInfiniteOrNoSolutions";

export default function VariablesBothSidesInfiniteOrNoSolutionsPage() {
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
        Variables Both Sides Infinite or No Solutions
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Some equations don&apos;t have exactly one solution. When the
        variable cancels out completely, what&apos;s left tells you whether
        every number works or no number works.
      </p>
      <StepSolver
        generate={generateVariablesBothSidesInfiniteOrNoSolutionsInstance}
        skillName="Variables Both Sides Infinite or No Solutions"
      />
    </div>
  );
}
