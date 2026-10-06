"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
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

// What to press on the keyboard, styled like a key cap.
function Key({ children }: { children: string }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--ink)",
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderBottomWidth: 2,
        borderRadius: 6,
        padding: "1px 7px",
        margin: "0 2px",
      }}
    >
      {children}
    </kbd>
  );
}

// A small piece of rendered math inside a sentence.
function MathBit({ latex }: { latex: string }) {
  return (
    <span style={{ color: "var(--ink)", fontSize: 15, display: "inline-block", verticalAlign: "middle" }}>
      <InlineMath math={latex} />
    </span>
  );
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
  // Skill picker: closed, showing the three categories, or showing one
  // category's skills (by its label).
  const [picker, setPicker] = useState<"closed" | "categories" | string>("closed");
  const openGroup = SKILL_GROUPS.find((g) => g.label === picker) ?? null;
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
  // Same width as each skill's own practice page: 1300px for everything
  // except elimination (whose page is still 900px).
  const wide = !!option && option.skill.id !== "elimination";

  return (
    <div style={{ maxWidth: wide ? 1300 : 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <style>{`
        .yp-skill:hover, .yp-category:hover { border-color: var(--group-color) !important; }
        .yp-category:hover { background: var(--paper) !important; }
        .yp-topic:hover { box-shadow: 0 0 0 3px rgba(46,111,163,0.15); }
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
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5, flex: "1 1 320px" }}>
              <p style={{ margin: "0 0 8px" }}>
                Use <Key>/</Key> for a fraction. Example: for <MathBit latex={"\\frac{1}{2}"} />, type <Key>1/2</Key>
              </p>
              <p style={{ margin: "0 0 8px" }}>
                Use <Key>^</Key> for an exponent. Example: for <MathBit latex="x^2" />, type <Key>x^2</Key>
              </p>
              <p style={{ margin: 0 }}>For a system, put a comma between the two equations. Press Enter to solve.</p>
            </div>
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

          {/* Skill picker: topic -> category -> skill */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-soft)" }}>
              Or start from a skill: pick one to load an example problem you can change before solving.
            </p>
            <button
              type="button"
              className="yp-topic"
              aria-expanded={picker !== "closed"}
              onClick={() => setPicker(picker === "closed" ? "categories" : "closed")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1.5px solid var(--blue)",
                background: picker !== "closed" ? "var(--blue)" : "var(--card)",
                color: picker !== "closed" ? "#fff" : "var(--blue)",
                borderRadius: 999,
                padding: "8px 18px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Equations / Inequalities
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  transition: "transform 0.15s ease",
                  transform: picker !== "closed" ? "rotate(180deg)" : "none",
                  fontSize: 11,
                }}
              >
                ▼
              </span>
            </button>

            {picker === "categories" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                {SKILL_GROUPS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    className="yp-category"
                    onClick={() => setPicker(g.label)}
                    style={{
                      ["--group-color" as string]: g.color,
                      textAlign: "left",
                      background: "var(--card)",
                      border: "1px solid var(--line)",
                      borderTop: `3px solid ${g.color}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                      cursor: "pointer",
                      color: "var(--ink)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{g.label}</span>
                    </span>
                    <span style={{ display: "block", marginTop: 4, fontSize: 12.5, color: "var(--ink-soft)" }}>
                      {g.skills.length} skills
                    </span>
                  </button>
                ))}
              </div>
            )}

            {openGroup && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setPicker("categories")}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--blue)",
                      cursor: "pointer",
                    }}
                  >
                    ← Back
                  </button>
                  <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                    Equations / Inequalities ›{" "}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: openGroup.color }} />
                      <strong style={{ color: "var(--ink)" }}>{openGroup.label}</strong>
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {openGroup.skills.map((sk) => {
                    const active = activeExample?.skill.id === sk.skill.id;
                    return (
                      <button
                        key={sk.skill.id}
                        type="button"
                        className="yp-skill"
                        aria-pressed={active}
                        onClick={() => loadExample(sk)}
                        style={{
                          ["--group-color" as string]: openGroup.color,
                          border: `1px solid ${active ? openGroup.color : "var(--line)"}`,
                          background: active ? openGroup.color : "var(--paper)",
                          color: active ? "#fff" : "var(--ink)",
                          borderRadius: 999,
                          padding: "7px 14px",
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
            )}
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
