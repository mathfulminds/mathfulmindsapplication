"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import type { DistributeVisual, GridRow, PairedGridRow, SolverInstance, SolverStep } from "@/lib/skills/types";
import Celebration from "@/components/solver/Celebration";

function isPairedRow(row: GridRow | PairedGridRow): row is PairedGridRow {
  return "eq1" in row;
}

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

function Cell({ math, color, align = "center" }: { math: string; color: string; align?: "center" | "right" }) {
  const isPlainText = math.startsWith(PLAINTEXT_PREFIX);
  const isStackedFraction = math.startsWith(STACKEDFRACTION_PREFIX);
  return (
    <div
      style={{
        textAlign: align,
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

// Small reference diagram shown above the grid while a distribution
// step is active. Always displays the ORIGINAL undistributed expression
// "coefficient(term1term2)" - the grid below independently shows the
// evolving computed result via the normal row-update mechanism, so this
// stays a fixed reference rather than needing to track computed values
// itself. Arcs accumulate: 0 before the first distribute step is
// answered, 1 once it's answered (coefficient -> term1), 2 once the
// second is also answered (coefficient -> term2 added, first arc stays).
//
// This can't be anchored to the real grid cells the way the graph-step
// number line or a cross-cell arrow could be: the coefficient and term1
// deliberately share ONE grid cell (from the column-alignment fix), so
// there's no second, distinct cell to measure "just the coefficient" vs
// "just term1" apart from each other. Predictable monospace character
// widths are the only way to get that sub-cell precision.
function DistributeDiagram({
  coefficient,
  term1,
  term2,
  arcsShown,
}: {
  coefficient: string;
  term1: string;
  term2: string;
  arcsShown: 0 | 1 | 2;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coefRef = useRef<HTMLSpanElement | null>(null);
  const term1Ref = useRef<HTMLSpanElement | null>(null);
  const term2Ref = useRef<HTMLSpanElement | null>(null);
  const [measured, setMeasured] = useState<{ coefX: number; term1X: number; term2X: number; y: number } | null>(
    null
  );

  // Measures the REAL rendered position of each token - this is safe here
  // (unlike trying to anchor to a grid cell) because each token is its
  // own separately-rendered KaTeX element from the start, not a substring
  // pulled out of one merged blob. Real KaTeX also means "\," and any
  // other KaTeX syntax in term2 renders correctly instead of showing up
  // as literal backslash-text, and the font matches the grid exactly
  // since it's the same InlineMath component rendering both.
  useLayoutEffect(() => {
    if (!containerRef.current || !coefRef.current || !term1Ref.current || !term2Ref.current) {
      setMeasured(null);
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const coefRect = coefRef.current.getBoundingClientRect();
    const term1Rect = term1Ref.current.getBoundingClientRect();
    const term2Rect = term2Ref.current.getBoundingClientRect();
    setMeasured({
      coefX: coefRect.left + coefRect.width / 2 - containerRect.left,
      term1X: term1Rect.left + term1Rect.width / 2 - containerRect.left,
      term2X: term2Rect.left + term2Rect.width / 2 - containerRect.left,
      y: coefRect.top - containerRect.top,
    });
  }, [coefficient, term1, term2]);

  const arcGap = 10;
  let arc1Path = "";
  let arc2Path = "";
  if (measured) {
    const dist1 = Math.abs(measured.term1X - measured.coefX);
    const height1 = 8 + dist1 * 0.22;
    const top1 = measured.y - arcGap - height1;
    const mid1 = (measured.coefX + measured.term1X) / 2;
    arc1Path = `M ${measured.coefX} ${measured.y - arcGap} Q ${mid1} ${top1} ${measured.term1X} ${measured.y - arcGap}`;

    const dist2 = Math.abs(measured.term2X - measured.coefX);
    // Guaranteed clearance over arc 1, not just independently scaled by
    // distance - two arcs sharing a start point will otherwise cross
    // unless the taller one is forced to clear the shorter one's peak by
    // a fixed margin.
    const height2 = Math.max(height1 + 16, 8 + dist2 * 0.22);
    const top2 = measured.y - arcGap - height2;
    const mid2 = (measured.coefX + measured.term2X) / 2;
    arc2Path = `M ${measured.coefX} ${measured.y - arcGap} Q ${mid2} ${top2} ${measured.term2X} ${measured.y - arcGap}`;
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block", paddingTop: 34 }}>
      {measured && (
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <defs>
            <marker id="distribute-diagram-head" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--ink-soft)" />
            </marker>
          </defs>
          {arcsShown >= 1 && (
            <path d={arc1Path} stroke="var(--ink-soft)" strokeWidth={1.3} fill="none" markerEnd="url(#distribute-diagram-head)" />
          )}
          {arcsShown >= 2 && (
            <path d={arc2Path} stroke="var(--ink-soft)" strokeWidth={1.3} fill="none" markerEnd="url(#distribute-diagram-head)" />
          )}
        </svg>
      )}
      <div style={{ display: "flex", alignItems: "baseline", fontSize: 21 }}>
        <span ref={coefRef}>
          <InlineMath math={coefficient} />
        </span>
        <InlineMath math="(" />
        <span ref={term1Ref}>
          <InlineMath math={term1} />
        </span>
        <span ref={term2Ref} style={{ marginLeft: 4 }}>
          <InlineMath math={term2} />
        </span>
        <InlineMath math=")" />
      </div>
    </div>
  );
}

function EquationGrid({
  rows,
  eqColumnIndex,
  distributeAnnotation,
  eq1Annotation,
  eq2Annotation,
  termAlign,
}: {
  rows: (GridRow | PairedGridRow)[];
  eqColumnIndex: number;
  distributeAnnotation?: {
    coefficient: string;
    term1: string;
    term2: string;
    arcsShown: 0 | 1 | 2;
    termCols: [number, number];
  };
  eq1Annotation?: { coefficient: string; term1: string; term2: string; arcsShown: 0 | 1 | 2; termCols: [number, number] };
  eq2Annotation?: { coefficient: string; term1: string; term2: string; arcsShown: 0 | 1 | 2; termCols: [number, number] };
  termAlign?: "right";
}) {
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
            function colorFor(highlight: "success" | "phase-blue" | "phase-green" | undefined): string {
              if (highlight === "success" || highlight === "phase-green") return "var(--green)";
              if (highlight === "phase-blue") return "var(--blue)";
              return "var(--ink)";
            }

            // Renders one equation's 4 cells (used directly for a normal
            // single-equation row, and twice - once per equation - for a
            // paired row). Cells stay in the SAME repeat(4,auto) grid
            // track structure either way, which is what keeps a paired
            // row's columns aligned with every single-equation row above
            // or below it (e.g. the combined equation elimination
            // produces later). `marginBottom` tightens the gap between
            // the two equations of a pair specifically, without touching
            // the grid's own rowGap (which stays uniform for every other
            // row boundary).
            function renderCells(cells: readonly [string, string, string, string], rowKey: string, color: string, marginBottom?: number) {
              return cells.map((cellValue, colIndex) => {
                const style = marginBottom !== undefined ? { marginBottom } : undefined;
                if (colIndex === eqColumnIndex) {
                  return (
                    <div
                      key={`${rowKey}-${colIndex}`}
                      style={{
                        textAlign: "center",
                        color: "var(--ink-soft)",
                        fontSize: 18,
                        whiteSpace: "nowrap",
                        ...style,
                      }}
                    >
                      {cellValue.length > 0 ? <InlineMath math={cellValue} /> : null}
                    </div>
                  );
                }
                return (
                  <div key={`${rowKey}-${colIndex}`} style={style}>
                    <Cell math={cellValue} color={color} align={termAlign} />
                  </div>
                );
              });
            }

            // Same idea as the parentheses skill's row-0 spanning arrow
            // cell, generalized to work for either a plain row's cells or
            // one equation's cells within a paired row: when an
            // annotation is present, the two term columns merge into one
            // spanning cell containing the arrow diagram instead of
            // rendering normally.
            function renderCellsOrArrow(
              cells: readonly [string, string, string, string],
              rowKey: string,
              color: string,
              annotation: { coefficient: string; term1: string; term2: string; arcsShown: 0 | 1 | 2; termCols: [number, number] } | undefined,
              marginBottom?: number
            ) {
              if (!annotation) return renderCells(cells, rowKey, color, marginBottom);
              const [startCol] = [...annotation.termCols].sort((a, b) => a - b);
              return cells.map((cellValue, colIndex) => {
                const style = marginBottom !== undefined ? { marginBottom } : undefined;
                if (colIndex === startCol) {
                  return (
                    <div key={`${rowKey}-${colIndex}`} style={{ gridColumn: `${startCol + 1} / span 2`, ...style }}>
                      <DistributeDiagram
                        coefficient={annotation.coefficient}
                        term1={annotation.term1}
                        term2={annotation.term2}
                        arcsShown={annotation.arcsShown}
                      />
                    </div>
                  );
                }
                if (colIndex === startCol + 1) return null; // absorbed into the spanning cell above
                // Matches DistributeDiagram's own paddingTop:34 exactly,
                // so these cells sit at the same baseline as the equation
                // text inside the (now taller) spanning cell, instead of
                // being centered against the row's full height - which
                // includes the arc space above that text - and landing
                // too high.
                const paddedStyle = { paddingTop: 34, ...style };
                return colIndex === eqColumnIndex ? (
                  <div key={`${rowKey}-${colIndex}`} style={paddedStyle}>
                    <div
                      style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 18, whiteSpace: "nowrap" }}
                    >
                      {cellValue.length > 0 ? <InlineMath math={cellValue} /> : null}
                    </div>
                  </div>
                ) : (
                  <div key={`${rowKey}-${colIndex}`} style={paddedStyle}>
                    <Cell math={cellValue} color={color} align={termAlign} />
                  </div>
                );
              });
            }

            if (isPairedRow(row)) {
              const eq1Ann = rowIndex === 0 ? eq1Annotation : undefined;
              const eq2Ann = rowIndex === 0 ? eq2Annotation : undefined;
              return [
                ...renderCellsOrArrow(row.eq1, `${rowIndex}-eq1`, colorFor(row.eq1Highlight), eq1Ann, -8),
                ...renderCellsOrArrow(row.eq2, `${rowIndex}-eq2`, colorFor(row.eq2Highlight), eq2Ann),
              ];
            }

            const color = colorFor(row.highlight);

            // Row 0 (the original, never-updated expression) gets its two
            // term columns merged into one spanning cell containing the
            // arrow diagram, when this problem has one - this is what
            // makes the arrows sit directly on the actual first line of
            // the equation instead of floating as a separate duplicate
            // above the grid. Every other row (including this same slot
            // pair on later rows, once distribution is complete) renders
            // normally.
            const singleAnnotation = rowIndex === 0 ? distributeAnnotation : undefined;
            return renderCellsOrArrow(row.cells, `${rowIndex}`, color, singleAnnotation);
          })}
        </div>
      </div>
  );
}
export default function StepSolver({
  generate,
  skillName,
  finalButtonLabel = "Try a new problem →",
  celebrateOnComplete = false,
}: {
  generate: () => SolverInstance;
  skillName: string;
  finalButtonLabel?: string;
  celebrateOnComplete?: boolean;
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
  // Tracks the furthest step actually answered, separately from stepIndex
  // (which step is currently being VIEWED). This is what lets "Next"
  // after going "Previous" just resume showing already-answered steps
  // instead of demanding the student re-click the correct choice again -
  // only stepping past this point requires a fresh answer.
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  // Balloon celebration state - opt-in via celebrateOnComplete, so this
  // is entirely inert for every skill page that doesn't pass it. The ref
  // (not state) tracks whether this instance has already celebrated,
  // so revisiting the final step via Previous/Next doesn't replay it -
  // celebration is for the MOMENT of first completing the problem, not
  // something that fires every time that step happens to be on screen.
  const [celebration, setCelebration] = useState<number | null>(null);
  const celebratedRef = useRef(false);

  useEffect(() => {
    setInstance(generate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed null-safely (instance may still be null on the very first
  // render) so this can sit ABOVE the early-return guard below - every
  // hook in this component must run on every render, in the same order,
  // and an early return partway through would break that if any hook
  // depended on something only computed after it.
  const isLastStep = instance ? stepIndex === instance.steps.length - 1 : false;

  useEffect(() => {
    if (celebrateOnComplete && revealed && isLastStep && !celebratedRef.current) {
      celebratedRef.current = true;
      setCelebration(Date.now());
    }
  }, [celebrateOnComplete, revealed, isLastStep]);

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

  const slotOrder: string[] = ["__initial__"];
  const slotContent: Record<string, GridRow | PairedGridRow> = { __initial__: instance.initialRow };

  function applyUpdates(updates: { slotId: string; row: GridRow | PairedGridRow }[]) {
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

  const visibleRows: (GridRow | PairedGridRow)[] = slotOrder.map((id) => slotContent[id]);

  // If this problem has distribute steps, figure out how many arcs
  // should be showing based on step POSITION relative to those two
  // steps, not just the current step's own reveal state - that's what
  // makes the arcs persist once the user has moved past both distribute
  // questions, instead of disappearing the moment currentStep becomes
  // something else. Generalized to support up to two independent
  // annotations (one per equation) for systems-of-equations-style
  // skills, where each equation's arrows progress on its own schedule -
  // single-equation skills (parentheses) just get one, exactly as before.
  function computeAnnotation(
    content: DistributeVisual,
    steps: SolverStep[],
    eqColIdx: number
  ): { coefficient: string; term1: string; term2: string; arcsShown: 0 | 1 | 2; termCols: [number, number] } | undefined {
    if (content.chooseStepId) {
      const chooseIdx = steps.findIndex((s) => s.stepId === content.chooseStepId);
      const chooseReached = chooseIdx !== -1 && (stepIndex > chooseIdx || (stepIndex === chooseIdx && revealed));
      if (!chooseReached) return undefined;
    }
    const firstId = content.firstTermStepId ?? "distribute_first_term";
    const secondId = content.secondTermStepId ?? "distribute_second_term";
    const idx1 = steps.findIndex((s) => s.stepId === firstId);
    const idx2 = steps.findIndex((s) => s.stepId === secondId);
    let arcsShown: 0 | 1 | 2 = 0;
    if (idx1 !== -1 && idx2 !== -1) {
      if (stepIndex < idx1) arcsShown = 0;
      else if (stepIndex === idx1) arcsShown = revealed ? 1 : 0;
      else if (stepIndex === idx2) arcsShown = revealed ? 2 : 1;
      else arcsShown = 2; // past both - stays at 2 regardless of later steps' own reveal state
    }
    // eqColumnIndex is 2 for expressionLeft (term cells at 0,1) or 1 for
    // expressionRight (term cells at 2,3) - see eqColumnIndexFor.
    const termCols: [number, number] = eqColIdx === 2 ? [0, 1] : [2, 3];
    return { coefficient: content.coefficient, term1: content.term1, term2: content.term2, arcsShown, termCols };
  }

  const eq1DistributeContent = instance.steps.find((s) => s.distributeVisual?.equation === "eq1")?.distributeVisual;
  const eq2DistributeContent = instance.steps.find((s) => s.distributeVisual?.equation === "eq2")?.distributeVisual;
  const singleDistributeContent = instance.steps.find((s) => s.distributeVisual && !s.distributeVisual.equation)?.distributeVisual;

  const eq1Annotation = eq1DistributeContent ? computeAnnotation(eq1DistributeContent, instance.steps, instance.eqColumnIndex) : undefined;
  const eq2Annotation = eq2DistributeContent ? computeAnnotation(eq2DistributeContent, instance.steps, instance.eqColumnIndex) : undefined;
  const distributeAnnotation = singleDistributeContent ? computeAnnotation(singleDistributeContent, instance.steps, instance.eqColumnIndex) : undefined;

  function handleChoice(i: number) {
    if (revealed) return;
    setSelected(i);
    if (currentStep.choices[i].isCorrect) {
      setRevealed(true);
      setFurthestStepIndex((prev) => Math.max(prev, stepIndex));
    }
  }

  // Shared by both Previous and "Next into already-answered territory":
  // jumps to a step and, if it's already been answered before, shows it
  // immediately in its answered state (correct choice highlighted)
  // rather than making the student re-click it.
  function goToStep(newIndex: number, alreadyAnswered: boolean) {
    setStepIndex(newIndex);
    if (alreadyAnswered) {
      setSelected(instance!.steps[newIndex].choices.findIndex((c) => c.isCorrect));
      setRevealed(true);
    } else {
      setSelected(null);
      setRevealed(false);
    }
  }

  function handlePrevious() {
    if (stepIndex === 0) return;
    // Any step behind the current position has necessarily already been
    // answered (steps only advance on a correct answer), so this is
    // always pure review.
    goToStep(stepIndex - 1, true);
  }

  function handleNext() {
    const nextIndex = stepIndex + 1;
    goToStep(nextIndex, nextIndex <= furthestStepIndex);
  }

  function handleNewProblem() {
    setInstance(generate());
    setStepIndex(0);
    setSelected(null);
    setRevealed(false);
    setFurthestStepIndex(0);
    celebratedRef.current = false;
    setCelebration(null);
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
      {celebration !== null && <Celebration celebrationKey={celebration} onDone={() => setCelebration(null)} />}
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
        <EquationGrid
          rows={visibleRows}
          eqColumnIndex={instance.eqColumnIndex}
          distributeAnnotation={distributeAnnotation}
          eq1Annotation={eq1Annotation}
          eq2Annotation={eq2Annotation}
          termAlign={instance.termAlign}
        />
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
              role="progressbar"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={instance.steps.length}
              style={{
                width: "100%",
                height: 6,
                borderRadius: 999,
                background: "var(--line)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(100 * (stepIndex + (revealed ? 1 : 0.15))) / instance.steps.length}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--blue)",
                  transition: "width 0.3s ease",
                }}
              />
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
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {stepIndex > 0 && (
                <button
                  onClick={handlePrevious}
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--paper)",
                    color: "var(--ink)",
                    border: "1.5px solid var(--line)",
                    borderRadius: 999,
                    padding: "9px 20px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ← Previous step
                </button>
              )}
              {revealed && !isLastStep && (
                <button
                  onClick={handleNext}
                  style={{
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
                  {finalButtonLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
