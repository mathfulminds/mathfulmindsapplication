"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generatePowerInstance } from "@/lib/skills/squareCubeRoots";

export default function SquareCubeRootsPage() {
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
        Square &amp; cube roots
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 32 }}>
        Undo a square or a cube by taking a root of both sides - and remember
        that a square has two roots.
      </p>
      <StepSolver generate={generatePowerInstance} skillName="Square & cube roots" />
    </div>
  );
}
