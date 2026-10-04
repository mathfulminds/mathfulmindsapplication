"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import StepSolver from "@/components/solver/StepSolver";
import MathInput from "@/components/MathInput";
import type { MathInputHandle } from "@/components/MathInput";
import { routeInput } from "@/lib/input/routeEquation";
import type { RouteResult } from "@/lib/input/routeEquation";

// "Solve your own problem": a student types (or, later, photographs) any
// equation, inequality, or system, and it's routed to the matching skill's
// step-by-step solver - see src/lib/input/ for how parsing and routing work.

// LaTeX, since the math field displays (and returns) LaTeX.
const EXAMPLES = [
  "3x+5=11",
  "\\frac{x}{4}=5",
  "-2\\left(3x-1\\right)\\ge8",
  "\\frac{2}{3}x+4=10",
  "5x-3=2x+9",
  "x+2y=7,\\;3x-2y=5",
];

interface Solved {
  id: number; // bumps on every solve, so StepSolver remounts fresh
  result: Extract<RouteResult, { ok: true }>;
}

export default function YourProblemPage() {
  const [latex, setLatex] = useState("");
  const [solved, setSolved] = useState<Solved | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mathRef = useRef<MathInputHandle>(null);
  const latexRef = useRef("");
  const solveCount = useRef(0);

  const isEmpty = (l: string) => l.replace(/\\placeholder\{[^}]*\}|\s|\\[,;: ]/g, "") === "";

  function solve(input: string) {
    if (isEmpty(input)) return;
    const result = routeInput(input);
    if (result.ok) {
      solveCount.current += 1;
      setSolved({ id: solveCount.current, result });
      setOptionIndex(0);
      setError(null);
    } else {
      setSolved(null);
      setError(result.error);
    }
  }

  const option = solved ? solved.result.options[Math.min(optionIndex, solved.result.options.length - 1)] : null;
  // The two-track substitution layout needs the same extra width its own
  // practice page gives it.
  const wide = option?.skill.id === "substitution";

  return (
    <div style={{ maxWidth: wide ? 1300 : 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <style>{`
        .yp-chip:hover { border-color: var(--blue) !important; }
        .yp-solve:hover:not(:disabled) { background: var(--blue-dark) !important; }
      `}</style>

      {/* 852 = the normal 900px page width minus its 24px side padding, so
          the input card stays exactly where it was when a system switches
          the page to the wider two-track layout. */}
      <div style={{ maxWidth: 852, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, marginBottom: 8 }}>
          Solve your own problem
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 24 }}>
          Type an equation, an inequality, or a system of two equations. You&apos;ll work through it one step at a
          time, the same way as the practice skills.
        </p>

        {/* INPUT CARD */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderTop: "3px solid var(--blue)",
            borderRadius: 14,
            padding: "20px 20px 18px",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
              }}
            >
              Your problem
            </span>
          </div>

          <MathInput
            ref={mathRef}
            ariaLabel="Your problem"
            onChange={(l) => {
              latexRef.current = l;
              setLatex(l);
              setError(null);
            }}
            onSubmit={() => solve(latexRef.current)}
          />

          {/* Error */}
          <div aria-live="polite">
            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  background: "rgba(226,87,76,0.07)",
                  border: "1px solid rgba(226,87,76,0.35)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 16,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6, flex: "1 1 320px" }}>
              Type <strong>/</strong> for a fraction and <strong>^</strong> for an exponent. For a system, put a
              comma between the two equations. Press Enter to solve.
            </p>
            <button
              type="button"
              className="yp-solve"
              disabled={isEmpty(latex)}
              onClick={() => solve(latexRef.current)}
              style={{
                background: "var(--blue)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "12px 26px",
                fontSize: 15,
                fontWeight: 700,
                cursor: isEmpty(latex) ? "default" : "pointer",
                opacity: isEmpty(latex) ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              Solve it →
            </button>
          </div>

          {/* Examples */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginRight: 2 }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="yp-chip"
                onClick={() => {
                  mathRef.current?.setValue(ex);
                  latexRef.current = ex;
                  solve(ex);
                }}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--paper)",
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 14,
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                <InlineMath math={ex} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SOLVER */}
      {solved && option && (
        <section>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
            }}
          >
            {solved.result.options.length > 1 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                <div role="radiogroup" aria-label="Method" style={{ display: "flex", gap: 6 }}>
                  {solved.result.options.map((o, i) => {
                    const active = o === option;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setOptionIndex(i)}
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
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>
                Skill: <strong style={{ color: "var(--ink)" }}>{option.skill.name}</strong>
              </span>
            )}
            <Link
              href={option.skill.href}
              style={{ fontSize: 14, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}
            >
              Practice more like this →
            </Link>
          </div>

          <StepSolver
            key={`${solved.id}-${option.id}`}
            generate={() => option.instance}
            skillName={option.skill.name}
            finalButtonLabel="Start this problem over ↺"
          />
        </section>
      )}
    </div>
  );
}
