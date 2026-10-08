"use client";

import { useState } from "react";
import StepSolver from "@/components/solver/StepSolver";
import { generateOneStepRationalInstance } from "@/lib/skills/oneStepRational";
import type { RationalMode as Mode } from "@/lib/skills/oneStepRational";

const options: { value: Mode; label: string }[] = [
  { value: "fraction", label: "Fractions" },
  { value: "decimal", label: "Decimals" },
];

export default function OneStepFractionsDecimalsPage() {
  const [modeChoice, setModeChoice] = useState<Mode>("fraction");

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
        One-step equations with fractions and decimals
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
        Undo one operation to get the variable alone, using fractions or
        decimals.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
          }}
        >
          Numbers:
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {options.map((opt) => {
            const active = modeChoice === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setModeChoice(opt.value)}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: active ? "var(--blue)" : "var(--card)",
                  color: active ? "#fff" : "var(--ink)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* key={modeChoice} forces a fresh problem whenever the mode changes,
          instead of leaving a stale problem on screen in the old mode. */}
      <StepSolver
        key={modeChoice}
        generate={() => generateOneStepRationalInstance(modeChoice)}
        skillName="One-step equations with fractions & decimals"
      />
    </div>
  );
}
