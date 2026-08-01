"use client";

import { useEffect, useState } from "react";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import type { GridRow, SolverInstance } from "@/lib/skills/types";

function Cell({ math, color }: { math: string; color: string }) {
  return (
    <div style={{ textAlign: "center", color }}>
      <InlineMath math={math} />
    </div>
  );
}

// Renders a string that may contain inline KaTeX segments marked with
// $...$ (e.g. "Multiply both sides by $\\dfrac{3}{2}$"). Plain text
// outside the $ markers renders as ordinary text; content inside renders
// as real math. Strings with no $ markers at all render as plain text
// unchanged - fully backward compatible with every existing skill.
function MixedText({ content }: { content: string }) {
  const parts = content.split(/(\$[^$]+\$)/g).filter((p) => p.length > 0);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <InlineMath key={i} math={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function EquationGrid({ rows, eqColumnIndex }: { rows: GridRow[]; eqColumnIndex: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, auto)",
        width: "fit-content",
        columnGap: 14,
        rowGap: 16,
        alignItems: "center",
        fontSize: 21,
      }}
    >
      {rows.flatMap((row, rowIndex) => {
        const color = row.highlight === "success" ? "var(--green)" : "var(--ink)";
        return row.cells.map((cellValue, colIndex) =>
          colIndex === eqColumnIndex ? (
            <div
              key={`${rowIndex}-${colIndex}`}
              style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 18 }}
            >
              {cellValue}
            </div>
          ) : (
            <Cell key={`${rowIndex}-${colIndex}`} math={cellValue} color={color} />
          )
        );
      })}
    </div>
  );
}

export default function StepSolver({
  generate,
  skillName,
}: {
  generate: () => SolverInstance;
  skillName: string;
}) {
  // Start as null - don't generate a random instance during server-side
  // render, since Math.random() would produce a DIFFERENT equation on the
  // server than on the client, causing a hydration mismatch. useEffect
  // only ever runs in the browser, guaranteeing this happens client-side
  // only, after hydration is already settled.
  const [instance, setInstance] = useState<SolverInstance | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setInstance(generate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!instance) {
    return (
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "32px 28px",
          minHeight: 320,
          color: "var(--ink-soft)",
          fontSize: 14,
        }}
      >
        Loading problem...
      </div>
    );
  }

  const currentStep = instance.steps[stepIndex];
  const isLastStep = stepIndex === instance.steps.length - 1;

  const slotOrder: string[] = ["__initial__"];
  const slotContent: Record<string, GridRow> = { __initial__: instance.initialRow };

  function applyUpdates(updates: { slotId: string; row: GridRow }[]) {
    for (const update of updates) {
      if (!(update.slotId in slotContent)) slotOrder.push(update.slotId);
      slotContent[update.slotId] = update.row;
    }
  }

  for (let i = 0; i < stepIndex; i++) {
    applyUpdates(instance.steps[i].rowUpdates);
  }
  if (revealed) {
    applyUpdates(currentStep.rowUpdates);
  }

  const visibleRows: GridRow[] = slotOrder.map((id) => slotContent[id]);

  function handleChoice(i: number) {
    if (revealed) return;
    setSelected(i);
    if (currentStep.choices[i].isCorrect) {
      setRevealed(true);
    }
  }

  function handleNext() {
    setStepIndex(stepIndex + 1);
    setSelected(null);
    setRevealed(false);
  }

  function handleNewProblem() {
    setInstance(generate());
    setStepIndex(0);
    setSelected(null);
    setRevealed(false);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        border: "1px solid var(--line)",
        borderRadius: 16,
        overflow: "hidden",
        background: "var(--card)",
      }}
    >
      {/* LEFT: math */}
      <div
        style={{
          padding: "32px 28px",
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 320,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            fontFamily: "var(--font-body)",
          }}
        >
          {skillName}
        </div>
        <EquationGrid rows={visibleRows} eqColumnIndex={instance.eqColumnIndex} />
        {revealed && currentStep && (
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--green)",
              fontWeight: 600,
            }}
          >
            ✓ <MixedText content={currentStep.explanationOnCorrect} />
          </div>
        )}
      </div>

      {/* RIGHT: MCQ */}
      <div
        style={{
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 14,
          minHeight: 320,
        }}
      >
        {currentStep && (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
              }}
            >
              Step {stepIndex + 1} of {instance.steps.length}
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              <MixedText content={currentStep.prompt} />
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {currentStep.choices.map((choice, i) => {
                const isSelected = selected === i;
                const showWrong = isSelected && !choice.isCorrect;
                const showRight = revealed && choice.isCorrect;
                return (
                  <button
                    key={i}
                    onClick={() => handleChoice(i)}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: `1.5px solid ${
                        showRight
                          ? "var(--green)"
                          : showWrong
                          ? "var(--coral)"
                          : "var(--line)"
                      }`,
                      background: showRight
                        ? "rgba(75,155,110,0.08)"
                        : showWrong
                        ? "rgba(225,90,76,0.08)"
                        : "var(--paper)",
                      cursor: revealed ? "default" : "pointer",
                      fontSize: 14,
                      color: "var(--ink)",
                    }}
                  >
                    <MixedText content={choice.text} />
                  </button>
                );
              })}
            </div>
            {revealed && !isLastStep && (
              <button
                onClick={handleNext}
                style={{
                  marginTop: 10,
                  alignSelf: "flex-start",
                  background: "var(--blue)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Next step →
              </button>
            )}
            {revealed && isLastStep && (
              <button
                onClick={handleNewProblem}
                style={{
                  marginTop: 10,
                  alignSelf: "flex-start",
                  background: "var(--blue)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Try a new problem →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
