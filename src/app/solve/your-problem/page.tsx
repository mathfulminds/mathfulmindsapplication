"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import StepSolver from "@/components/solver/StepSolver";
import { parseInput } from "@/lib/input/parseEquation";
import { routeInput } from "@/lib/input/routeEquation";
import type { RouteResult } from "@/lib/input/routeEquation";

// "Solve your own problem": a student types (or, later, photographs) any
// equation, inequality, or system, and it's routed to the matching skill's
// step-by-step solver - see src/lib/input/ for how parsing and routing work.

const EXAMPLES = [
  "3x + 5 = 11",
  "x/4 = 5",
  "-2(3x - 1) ≥ 8",
  "(2/3)x + 4 = 10",
  "5x - 3 = 2x + 9",
  "x + 2y = 7, 3x - 2y = 5",
];

// Symbols that are awkward to type on a phone keyboard.
const SYMBOLS: { label: string; insert: string; aria: string }[] = [
  { label: "≤", insert: " ≤ ", aria: "less than or equal to" },
  { label: "≥", insert: " ≥ ", aria: "greater than or equal to" },
  { label: "<", insert: " < ", aria: "less than" },
  { label: ">", insert: " > ", aria: "greater than" },
  { label: "( )", insert: "()", aria: "parentheses" },
  { label: "a/b", insert: "/", aria: "fraction bar" },
];

interface Solved {
  id: number; // bumps on every solve, so StepSolver remounts fresh
  result: Extract<RouteResult, { ok: true }>;
}

export default function YourProblemPage() {
  const [text, setText] = useState("");
  const [solved, setSolved] = useState<Solved | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [error, setError] = useState<{ message: string; latex?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const solveCount = useRef(0);

  // Live preview of how the input is being read - shown only once it
  // parses, so half-typed problems don't flash error messages.
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const p = parseInput(text);
    if (!p.ok) return null;
    return p.equations.length === 1
      ? p.equations[0].latex
      : `\\begin{cases} ${p.equations.map((e) => e.latex).join(" \\\\ ")} \\end{cases}`;
  }, [text]);

  function solve(input: string) {
    const result = routeInput(input);
    if (result.ok) {
      solveCount.current += 1;
      setSolved({ id: solveCount.current, result });
      setOptionIndex(0);
      setError(null);
    } else {
      setSolved(null);
      setError({ message: result.error, latex: result.latex });
    }
  }

  function insertSymbol(sym: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + sym + text.slice(end);
    setText(next);
    setError(null);
    // Put the cursor inside "()" or right after anything else.
    const caret = start + (sym === "()" ? 1 : sym.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  const option = solved ? solved.result.options[Math.min(optionIndex, solved.result.options.length - 1)] : null;
  // The two-track substitution layout needs the same extra width its own
  // practice page gives it.
  const wide = option?.skill.id === "substitution";

  return (
    <div style={{ maxWidth: wide ? 1300 : 900, margin: "0 auto", padding: "48px 24px 80px" }}>
      <style>{`
        .yp-chip:hover { border-color: var(--blue) !important; color: var(--blue) !important; }
        .yp-sym:hover { background: var(--paper) !important; }
        .yp-input:focus { outline: none; border-color: var(--blue) !important; box-shadow: 0 0 0 3px rgba(46,111,163,0.15); }
        .yp-solve:hover { background: var(--blue-dark) !important; }
        @media (max-width: 640px) {
          .yp-row { flex-direction: column; align-items: stretch !important; }
        }
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            solve(text);
          }}
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderTop: "3px solid var(--blue)",
            borderRadius: 14,
            padding: "20px 20px 18px",
            marginBottom: 28,
          }}
        >
          <label
            htmlFor="problem-input"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              marginBottom: 8,
            }}
          >
            Your problem
          </label>
          <div className="yp-row" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              id="problem-input"
              ref={inputRef}
              className="yp-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 3x + 5 = 11"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby="problem-help"
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                padding: "12px 14px",
                border: "1.5px solid var(--line)",
                borderRadius: 10,
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            />
            <button
              type="submit"
              className="yp-solve"
              disabled={!text.trim()}
              style={{
                background: "var(--blue)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 700,
                cursor: text.trim() ? "pointer" : "default",
                opacity: text.trim() ? 1 : 0.5,
                whiteSpace: "nowrap",
              }}
            >
              Solve it →
            </button>
          </div>

          {/* Symbol buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {SYMBOLS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="yp-sym"
                aria-label={`Insert ${s.aria}`}
                onClick={() => insertSymbol(s.insert)}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  borderRadius: 8,
                  minWidth: 40,
                  padding: "6px 10px",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Live preview / error */}
          <div aria-live="polite" style={{ marginTop: 14, minHeight: 28 }}>
            {error ? (
              <div
                role="alert"
                style={{
                  background: "rgba(226,87,76,0.07)",
                  border: "1px solid rgba(226,87,76,0.35)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                }}
              >
                {error.latex && (
                  <div style={{ marginBottom: 6, fontSize: 17 }}>
                    <InlineMath math={error.latex} />
                  </div>
                )}
                {error.message}
              </div>
            ) : preview ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>I read this as:</span>
                <span style={{ fontSize: 19 }}>
                  <InlineMath math={preview} />
                </span>
              </div>
            ) : null}
          </div>

          <p id="problem-help" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            Use <code style={{ fontFamily: "var(--font-mono)" }}>/</code> for fractions (
            <code style={{ fontFamily: "var(--font-mono)" }}>x/4</code>,{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>(2/3)x</code>). For a system, put a comma between the two
            equations.
          </p>

          {/* Examples */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginRight: 2 }}>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="yp-chip"
                onClick={() => {
                  setText(ex);
                  solve(ex);
                }}
                style={{
                  border: "1px solid var(--line)",
                  background: "var(--paper)",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </form>
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
