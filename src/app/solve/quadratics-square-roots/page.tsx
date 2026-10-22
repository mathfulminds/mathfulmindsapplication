"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateSqInstance } from "@/lib/skills/quadraticsSquareRoots";

export default function QuadraticsSquareRootsPage() {
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
        Quadratics by square roots
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Get the square by itself, take the square root of both sides, then
        split it into two equations - one for the positive root, one for the negative.
      </p>
      <StepSolver generate={generateSqInstance} skillName="Quadratics by square roots" />
    </div>
  );
}
