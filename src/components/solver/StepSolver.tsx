"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import type { GridRow, SolverInstance } from "@/lib/skills/types";

const PLAINTEXT_PREFIX = "PLAINTEXT:";
const GRAPH_PREFIX = "GRAPH:";
const NUMBER_START = "\u0003";
const NUMBER_END = "\u0004";
const OVERLINE_START = "\u0001";
const OVERLINE_END = "\u0002";

// Renders a choice encoded as "GRAPH:{boundary}|{left|right}|{0|1}" (see
// graphChoiceText in inequalityCore.ts) as a small SVG number line instead
// of text. This file stays skill-agnostic on purpose - it only knows the
// GRAPH: prefix protocol, the same way it only knows the PLAINTEXT:/
// STACKEDFRACTION: protocols below, without importing anything from a
// specific skill file.
const FRACLABEL_PREFIX = "FRACLABEL:";

// Renders a graph label. Three cases:
//   - plain text (a whole number, or unused here but harmless otherwise)
//   - decimal text containing OVERLINE_START/END markers (a repeating
//     portion), rendered via SVG's text-decoration:overline on a <tspan> -
//     the SVG equivalent of the CSS border-top trick renderNumber uses in
//     the main grid, for the same reason: KaTeX's own \overline has a
//     documented bug, and there's no KaTeX involved here regardless since
//     this is a small standalone SVG, not a grid cell.
//   - "FRACLABEL:{sign}{num}/{den}", a real stacked numerator-over-
//     denominator fraction (matching how fractions look everywhere else
//     in the app, rather than "11/8" plain-text slash notation). A <line>
//     can't nest inside a <text> element the way a <tspan> can, so this
//     case returns its own group of sibling <text>/<line> elements
//     instead of contributing to a single shared <text> the way the other
//     two cases do.
function GraphLabel({ text, x, y }: { text: string; x: number; y: number }) {
  if (text.startsWith(FRACLABEL_PREFIX)) {
    const raw = text.slice(FRACLABEL_PREFIX.length);
    const negative = raw.startsWith("-");
    const body = negative ? raw.slice(1) : raw;
    const [num, den] = body.split("/");
    const barHalfWidth = 12;
    return (
      <>
        {negative && (
          <text x={x - barHalfWidth - 8} y={y + 5} textAnchor="middle" fontSize={13} fill="var(--ink-soft)">
            -
          </text>
        )}
        <text x={x} y={y - 2} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">
          {num}
        </text>
        <line
          x1={x - barHalfWidth}
          y1={y + 3}
          x2={x + barHalfWidth}
          y2={y + 3}
          stroke="var(--ink-soft)"
          strokeWidth={1}
        />
        <text x={x} y={y + 17} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">
          {den}
        </text>
      </>
    );
  }

  const olStart = text.indexOf(OVERLINE_START);
  const olEnd = text.indexOf(OVERLINE_END);
  if (olStart === -1 || olEnd === -1) {
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={12} fill="var(--ink-soft)">
        {text}
      </text>
    );
  }
  const before = text.slice(0, olStart);
  const overlined = text.slice(olStart + 1, olEnd);
  const after = text.slice(olEnd + 1);
  const fullText = before + overlined + after;

  // A monospace font makes character width predictable, which is what
  // lets us compute exactly where the overlined substring starts and
  // ends and draw a real <line> there - the SVG equivalent of the CSS
  // border-top trick renderNumber uses for the same underlying problem
  // (KaTeX's \overline vs. here, SVG's text-decoration:overline - neither
  // renderer's native line-drawing is trustworthy, so both get replaced
  // with an explicitly drawn line instead).
  const fontSize = 12;
  const charWidth = fontSize * 0.6;
  const totalWidth = fullText.length * charWidth;
  const startX = x - totalWidth / 2;
  const overlineX1 = startX + before.length * charWidth;
  const overlineX2 = overlineX1 + overlined.length * charWidth;
  const overlineY = y - fontSize;

  return (
    <>
      <text x={startX} y={y} textAnchor="start" fontSize={fontSize} fontFamily="monospace" fill="var(--ink-soft)">
        {fullText}
      </text>
      {overlined.length > 0 && (
        <line x1={overlineX1} y1={overlineY} x2={overlineX2} y2={overlineY} stroke="var(--ink-soft)" strokeWidth={1} />
      )}
    </>
  );
}

function NumberLineGraph({
  boundary,
  direction,
  inclusive,
  markerId,
}: {
  boundary: string;
  direction: "left" | "right";
  inclusive: boolean;
  markerId: string;
}) {
  const centerX = 80;
  const y = 24;
  const edgeX = direction === "right" ? 146 : 14;
  return (
    <svg viewBox="0 0 160 72" style={{ width: "100%", maxWidth: 200, display: "block" }}>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
        </marker>
      </defs>
      <line x1={8} y1={y} x2={152} y2={y} stroke="var(--line)" strokeWidth={1.5} />
      <line
        x1={centerX}
        y1={y}
        x2={edgeX}
        y2={y}
        stroke="currentColor"
        strokeWidth={3}
        markerEnd={`url(#${markerId})`}
      />
      <circle
        cx={centerX}
        cy={y}
        r={6}
        fill={inclusive ? "currentColor" : "#fff"}
        stroke="currentColor"
        strokeWidth={2.5}
      />
      <GraphLabel text={boundary} x={centerX} y={y + 20} />
    </svg>
  );
}

function parseGraphChoice(text: string): { boundary: string; direction: "left" | "right"; inclusive: boolean } {
  const raw = text.slice(GRAPH_PREFIX.length);
  const [boundaryStr, direction, inclusiveStr] = raw.split("|");
  return {
    boundary: boundaryStr,
    direction: direction === "left" ? "left" : "right",
    inclusive: inclusiveStr === "1",
  };
}

// Renders one number's contents (already stripped of the outer NUMBER_
// START/END markers) through REAL KaTeX, guaranteeing it matches the size
// and font of every other KaTeX-rendered value on the page exactly - no
// guessed font-size multiplier needed. Only the repeating digits (marked
// by OVERLINE_START/END) get pulled out and wrapped in our own CSS
// border-top, since KaTeX's own \overline command has a documented bug
// where the bar sometimes silently fails to draw.
function renderNumber(numberText: string, key: number): ReactNode {
  const olStart = numberText.indexOf(OVERLINE_START);
  const olEnd = numberText.indexOf(OVERLINE_END);
  if (olStart === -1 || olEnd === -1) {
    return <InlineMath key={key} math={numberText} />;
  }
  const before = numberText.slice(0, olStart);
  const overlined = numberText.slice(olStart + 1, olEnd);
  const after = numberText.slice(olEnd + 1);
  return (
    <span key={key} style={{ display: "inline-flex", alignItems: "baseline" }}>
      {before.length > 0 && <InlineMath math={before} />}
      <span
        style={{
          borderTop: "0.09em solid currentColor",
          paddingTop: "0.08em",
        }}
      >
        <InlineMath math={overlined} />
      </span>
      {after.length > 0 && <InlineMath math={after} />}
    </span>
  );
}

// Splits arbitrary text on the NUMBER_START/END markers. Everything
// outside them renders as plain text in whatever font it naturally
// inherits (the site's normal UI font); everything inside renders as real
// KaTeX via renderNumber. This is what lets an MCQ choice like
// "Subtracting 8.18 from both sides" show "8.18" in proper math styling
// while the surrounding English stays in the UI font, not the other way
// around.
function renderTextWithEmbeddedNumbers(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const startIdx = remaining.indexOf(NUMBER_START);
    if (startIdx === -1) {
      nodes.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (startIdx > 0) {
      nodes.push(<span key={key++}>{remaining.slice(0, startIdx)}</span>);
    }
    const endIdx = remaining.indexOf(NUMBER_END, startIdx);
    if (endIdx === -1) {
      nodes.push(<span key={key++}>{remaining.slice(startIdx)}</span>);
      break;
    }
    nodes.push(renderNumber(remaining.slice(startIdx + 1, endIdx), key++));
    remaining = remaining.slice(endIdx + 1);
  }
  return <>{nodes}</>;
}

const STACKEDFRACTION_PREFIX = "STACKEDFRACTION:";
const STACK_SEPARATOR = "\u0005";

// Builds a fraction-bar LAYOUT ourselves (two stacked rows, divider in
// between) instead of using KaTeX's own \dfrac. This is specifically for
// cases where the numerator might contain a repeating decimal - nesting
// that inside a real \dfrac would require KaTeX's own \overline again,
// which is the very thing we're avoiding. The denominator here is always
// a plain whole number for this skill, so it renders directly via KaTeX.
function renderStackedFraction(content: string, color: string): ReactNode {
  const sepIdx = content.indexOf(STACK_SEPARATOR);
  if (sepIdx === -1) return renderTextWithEmbeddedNumbers(content);
  const numeratorRaw = content.slice(0, sepIdx);
  const denominator = content.slice(sepIdx + 1);
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      <span style={{ paddingBottom: "0.15em" }}>
        {renderTextWithEmbeddedNumbers(numeratorRaw)}
      </span>
      <span
        style={{
          borderTop: `0.06em solid ${color}`,
          alignSelf: "stretch",
        }}
      />
      <span style={{ paddingTop: "0.15em" }}>
        <InlineMath math={denominator} />
      </span>
    </span>
  );
}

function Cell({ math, color }: { math: string; color: string }) {
  const isPlainText = math.startsWith(PLAINTEXT_PREFIX);
  const isStackedFraction = math.startsWith(STACKEDFRACTION_PREFIX);
  return (
    <div
      style={{
        textAlign: "center",
        color,
        overflow: "visible",
        lineHeight: 1.8,
        whiteSpace: "nowrap",
      }}
    >
      {isStackedFraction ? (
        renderStackedFraction(math.slice(STACKEDFRACTION_PREFIX.length), color)
      ) : isPlainText ? (
        renderTextWithEmbeddedNumbers(math.slice(PLAINTEXT_PREFIX.length))
      ) : (
        <InlineMath math={math} />
      )}
    </div>
  );
}

// Renders a string that may contain inline KaTeX segments marked with
// $...$ (e.g. "Multiply both sides by $\\dfrac{3}{2}$"). Plain text
// outside the $ markers renders as ordinary text in the normal UI font;
// content inside $ renders as real math. Plain segments are further
// checked for embedded NUMBER_START/END-marked numbers (see
// renderTextWithEmbeddedNumbers), since decimal values can appear inside
// otherwise-ordinary prompt/choice sentences.
function MixedText({ content }: { content: string }) {
  const parts = content.split(/(\$[^$]+\$)/g).filter((p) => p.length > 0);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <InlineMath key={i} math={part.slice(1, -1)} />
        ) : (
          <span key={i}>{renderTextWithEmbeddedNumbers(part)}</span>
        )
      )}
    </>
  );
}

function EquationGrid({ rows, eqColumnIndex }: { rows: GridRow[]; eqColumnIndex: number }) {
  return (
    <div style={{ overflowX: "auto", width: "100%", paddingTop: 14, paddingBottom: 4 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, auto)",
          width: "fit-content",
          columnGap: 14,
          rowGap: 20,
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
                  style={{
                    textAlign: "center",
                    color: "var(--ink-soft)",
                    fontSize: 18,
                    whiteSpace: "nowrap",
                  }}
                >
                  {cellValue.length > 0 ? <InlineMath math={cellValue} /> : null}
                </div>
              ) : (
                <Cell key={`${rowIndex}-${colIndex}`} math={cellValue} color={color} />
              )
            );
          })}
        </div>
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
    <>
      {/* Tailwind's global reset sets `border: 0 solid` on every element via
          a universal selector, which silently zeroes out the border-based
          lines KaTeX uses internally for overline/underline/fraction bars.
          This forces those specific KaTeX elements back to their intended
          width, with !important to guarantee it wins regardless of the
          Tailwind/KaTeX stylesheet load order. */}
      <style>{`
        .katex .overline .overline-line,
        .katex .underline .underline-line,
        .katex .frac-line,
        .katex .rule {
          border-bottom-width: 0.04em !important;
          border-bottom-style: solid !important;
          border-bottom-color: currentColor !important;
        }
      `}</style>
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
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, overflow: "visible", lineHeight: 1.8 }}>
              <MixedText content={currentStep.prompt} />
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {currentStep.choices.map((choice, i) => {
                const isSelected = selected === i;
                const showWrong = isSelected && !choice.isCorrect;
                const showRight = revealed && choice.isCorrect;
                const isGraph = choice.text.startsWith(GRAPH_PREFIX);
                return (
                  <button
                    key={i}
                    onClick={() => handleChoice(i)}
                    style={{
                      textAlign: isGraph ? "center" : "left",
                      padding: isGraph ? "10px 14px" : "16px 14px 10px 14px",
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
                      lineHeight: 1.6,
                      whiteSpace: isGraph ? "normal" : "nowrap",
                      overflowX: isGraph ? "visible" : "auto",
                    }}
                  >
                    {isGraph ? (
                      <NumberLineGraph {...parseGraphChoice(choice.text)} markerId={`graph-arrow-${i}`} />
                    ) : (
                      <MixedText content={choice.text} />
                    )}
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
    </>
  );
}
