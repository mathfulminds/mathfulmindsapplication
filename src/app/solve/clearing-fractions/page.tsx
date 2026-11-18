"use client";

import { useRef, useState } from "react";
import StepSolver from "@/components/solver/StepSolver";
import { buildFractionInstance, generateFractionProblem } from "@/lib/skills/linearGeneral";
import type { FractionMethod, FractionProblem } from "@/lib/skills/linearGeneral";
import { FRACTION_METHODS } from "@/lib/input/routeEquation";

export default function ClearingFractionsPage() {
  const [method, setMethod] = useState<FractionMethod>("lcd");
  // The problem on the card. Switching methods keeps it (the same problem
  // is worked the other way); "Try a new problem" replaces it.
  const problem = useRef<FractionProblem | null>(null);
  // keep: the method was just switched. settling: the card is being drawn
  // (StepSolver asks for its problem twice in a row in development).
  const keep = useRef(false);
  const settling = useRef(false);

  // StepSolver asks for a problem when the card is first drawn, and again
  // each time the student presses "Try a new problem".
  function generate() {
    if (!problem.current || !(keep.current || settling.current)) problem.current = generateFractionProblem();
    keep.current = false;
    if (!settling.current) {
      settling.current = true;
      setTimeout(() => {
        settling.current = false;
      }, 0);
    }
    return buildFractionInstance(problem.current, method);
  }

  function pick(next: FractionMethod) {
    if (next === method) return;
    // the card is redrawn for the other method, with the same problem
    keep.current = true;
    setMethod(next);
  }

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
        Equations with fractions
      </h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 20 }}>
        Answer each step correctly to reveal the next line. Pick how you want
        to solve: without a calculator (clear the denominators with the LCD
        first), or with a calculator (keep the fractions).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
          }}
        >
          Solve by:
        </span>
        <div role="radiogroup" aria-label="Method" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FRACTION_METHODS.map((m) => {
            const active = m.method === method;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pick(m.method)}
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
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <StepSolver key={method} generate={generate} skillName="Equations with fractions" />
    </div>
  );
}
