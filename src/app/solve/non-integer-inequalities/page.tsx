"use client";

import { useState } from "react";
import StepSolver from "@/components/solver/StepSolver";
import { generateNonIntegerInequalityInstance, Mode } from "@/lib/skills/nonIntegerSolutionsInequalities";

const options: { value: Mode; label: string }[] = [
  { value: "fraction", label: "Fraction" },
  { value: "decimal", label: "Decimal" },
];

export default function NonIntegerInequalitiesPage() {
  const [modeChoice, setModeChoice] = useState<Mode>("fraction");

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
        Inequalities with non-integer solutions
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
        Answer each step correctly to reveal the next line. Sometimes the
        inequality itself includes a fraction or decimal too.
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
          Answer as:
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
        generate={() => generateNonIntegerInequalityInstance(modeChoice)}
        skillName="Inequalities with non-integer solutions"
      />
    </div>
  );
}
