"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import StepSolver from "@/components/solver/StepSolver";
import MathInput from "@/components/MathInput";
import type { MathInputHandle } from "@/components/MathInput";
import { routeInput } from "@/lib/input/routeEquation";
import type { RouteResult, SkillInfo } from "@/lib/input/routeEquation";
import { SKILL_GROUPS, exampleLatex } from "@/lib/input/skillExamples";
import type { SkillExample } from "@/lib/input/skillExamples";
import type { SolverInstance } from "@/lib/skills/types";

// "Solve your own problem": a student types (or, later, photographs) any
// equation, inequality, or system, and it's routed to the matching skill's
// step-by-step solver - see src/lib/input/ for how parsing and routing work.

// An example loaded from a skill button. If the student solves it without
// changing anything, they get exactly that skill's generated problem; once
// they edit it, it's routed like any typed problem.
interface LoadedExample {
  latex: string; // as the math field stores it
  title: string;
  skill: SkillInfo;
  instance: SolverInstance;
}

interface Solved {
  id: number; // bumps on every solve, so StepSolver remounts fresh
  result: Extract<RouteResult, { ok: true }>;
}

export default function YourProblemPage() {
  const [latex, setLatex] = useState("");
  const [solved, setSolved] = useState<Solved | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState<LoadedExample | null>(null);
  const mathRef = useRef<MathInputHandle>(null);
  const latexRef = useRef("");
  const solveCount = useRef(0);

  const isEmpty = (l: string) => l.replace(/\\placeholder\{[^}]*\}|\s|\\[,;: ]/g, "") === "";

  function solve(input: string) {
    if (isEmpty(input)) return;
    const result: RouteResult =
      example && input === example.latex
        ? {
            ok: true,
            latex: input,
            options: [{ id: example.skill.id, label: example.skill.name, skill: example.skill, instance: example.instance }],
          }
        : routeInput(input);
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

  function loadExample(ex: SkillExample) {
    const instance = ex.generate();
    const stored = mathRef.current?.setValue(exampleLatex(instance)) ?? exampleLatex(instance);
    latexRef.current = stored;
    setExample({ latex: stored, title: ex.title, skill: ex.skill, instance });
    setSolved(null);
    setError(null);
    mathRef.current?.focus();
  }

  // The skill button stays highlighted while its example is untouched.
  const activeExample = example && latex === example.latex ? example : null;

  const option = solved ? solved.result.options[Math.min(optionIndex, solved.result.options.length - 1)] : null;
  // The two-track substitution layout needs the same extra width its own
  // practice page gives it.
  const wide = option?.skill.id === "substitution";

  return (
    <div style={{ maxWidth: wide ? 1300 : 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <style>{`
        .yp-skill:hover { border-color: var(--group-color) !important; }
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

          {/* Skill picker */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              Or start from a skill
            </p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft)" }}>
              Pick a skill to load an example problem. Change it if you like, then press Solve. Pick the same skill
              again for a new example.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {SKILL_GROUPS.map((g) => (
                <div key={g.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color }} />
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--ink)",
                      }}
                    >
                      {g.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {g.skills.map((sk) => {
                      const active = activeExample?.skill.id === sk.skill.id;
                      return (
                        <button
                          key={sk.skill.id}
                          type="button"
                          className="yp-skill"
                          aria-pressed={active}
                          onClick={() => loadExample(sk)}
                          style={{
                            ["--group-color" as string]: g.color,
                            border: `1px solid ${active ? g.color : "var(--line)"}`,
                            background: active ? g.color : "var(--paper)",
                            color: active ? "#fff" : "var(--ink)",
                            borderRadius: 999,
                            padding: "6px 14px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {sk.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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
