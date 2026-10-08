"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { InlineMath as KatexInlineMath } from "react-katex";
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
            {"\u2212"}
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
        {text.replace(/-/g, "\u2212")}
      </text>
    );
  }
  const before = text.slice(0, olStart).replace(/-/g, "\u2212");
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

// The numeric value behind a graph label, so the point can sit at the
// right spot between the tick marks. Handles whole numbers, stacked
// fractions ("FRACLABEL:-7/2") and decimals with a repeating part (the
// repeating digits are expanded a few times - plenty for placement).
function graphLabelValue(text: string): number {
  if (text.startsWith(FRACLABEL_PREFIX)) {
    const raw = text.slice(FRACLABEL_PREFIX.length);
    const negative = raw.startsWith("-");
    const [num, den] = (negative ? raw.slice(1) : raw).split("/").map(Number);
    return (negative ? -1 : 1) * (num / den);
  }
  const olStart = text.indexOf(OVERLINE_START);
  const olEnd = text.indexOf(OVERLINE_END);
  let plain = text;
  if (olStart !== -1 && olEnd !== -1) {
    const rep = text.slice(olStart + 1, olEnd);
    plain = text.slice(0, olStart) + rep.repeat(6) + text.slice(olEnd + 1);
  }
  return parseFloat(plain.replace(/\u2212/g, "-"));
}

// Whole numbers written with a real minus sign, as in a textbook.
function tickLabel(n: number): string {
  return n < 0 ? `\u2212${Math.abs(n)}` : String(n);
}

// A textbook-style number line: arrows on both ends, a tick at every whole
// number around the answer, labels under the ticks, an open or closed
// circle at the boundary, and the solution shaded as a thick ray. A whole-
// number boundary is shown by darkening its own tick label; a fraction or
// decimal boundary sits between ticks with its label above the point.
function NumberLineGraph({
  boundary,
  direction,
  inclusive,
  markerId,
  color = "var(--ink)",
  align = "center",
}: {
  boundary: string;
  direction: "left" | "right";
  inclusive: boolean;
  markerId: string;
  color?: string;
  align?: "center" | "left";
}) {
  const value = graphLabelValue(boundary);
  const isWhole = Number.isInteger(value);
  const lo = isWhole ? value - 4 : Math.floor(value) - 3;
  const hi = isWhole ? value + 4 : Math.ceil(value) + 3;
  const W = 320;
  const axisL = 8;
  const axisR = W - 8;
  const tickL = 34;
  const tickR = W - 34;
  const y = isWhole ? 16 : 46;
  const H = y + 32;
  const xOf = (v: number) => tickL + ((v - lo) / (hi - lo)) * (tickR - tickL);
  const px = xOf(value);
  const ticks: number[] = [];
  for (let n = lo; n <= hi; n++) ticks.push(n);
  const rayEnd = direction === "right" ? axisR : axisL;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block", margin: align === "center" ? "0 auto" : 0, overflow: "visible" }}
      role="img"
      aria-label={`Number line: ${inclusive ? "closed" : "open"} circle at ${boundary.replace(/^FRACLABEL:/, "")}, shaded to the ${direction}`}
    >
      <defs>
        <marker id={`${markerId}-ax`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
          <path d="M0,0.5 L8,4 L0,7.5 Z" fill="var(--ink-soft)" />
        </marker>
        <marker id={`${markerId}-ray`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={axisL + 6}
        y1={y}
        x2={axisR - 6}
        y2={y}
        stroke="var(--ink-soft)"
        strokeWidth={1.5}
        markerStart={`url(#${markerId}-ax)`}
        markerEnd={`url(#${markerId}-ax)`}
      />
      {ticks.map((n) => {
        const tx = xOf(n);
        const isAnswer = isWhole && n === value;
        return (
          <g key={n}>
            <line x1={tx} y1={y - 6} x2={tx} y2={y + 6} stroke="var(--ink-soft)" strokeWidth={1.25} />
            <text
              x={tx}
              y={y + 24}
              textAnchor="middle"
              fontSize={isAnswer ? 13 : 12}
              fontWeight={isAnswer ? 700 : 400}
              fill={isAnswer ? color : "var(--ink-soft)"}
            >
              {tickLabel(n)}
            </text>
          </g>
        );
      })}
      <line
        x1={px}
        y1={y}
        x2={direction === "right" ? rayEnd - 10 : rayEnd + 10}
        y2={y}
        stroke={color}
        strokeWidth={4}
        markerEnd={`url(#${markerId}-ray)`}
      />
      <circle cx={px} cy={y} r={6.5} fill={inclusive ? color : "var(--card)"} stroke={color} strokeWidth={2.5} />
      {!isWhole && <GraphLabel text={boundary} x={px} y={boundary.startsWith(FRACLABEL_PREFIX) ? y - 30 : y - 14} />}
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
const MARKEDTERM_PREFIX = "MARKEDTERM:";
const MARKEDFRACTION_PREFIX = "MARKEDFRACTION:";
const MARKEDPARENFRACTION_PREFIX = "MARKEDPARENFRACTION:";
const COEF_VAR_SEPARATOR = "\u0006";
// "(left)(right)", both sides always real KaTeX - a reciprocal fraction
// and the fraction-mode value it's multiplying never need the overline
// treatment (only decimal mode's values can repeat, and decimal mode
// uses a different technique entirely - see nonIntegerSolutions.ts).
// Format: "PARENMULT:{left}\u0007{right}".
const PARENMULT_PREFIX = "PARENMULT:";
const PARENMULT_SEPARATOR = "\u0007";

function renderParenMult(content: string, color: string): ReactNode {
  const sepIdx = content.indexOf(PARENMULT_SEPARATOR);
  if (sepIdx === -1) return renderTextWithEmbeddedNumbers(content);
  const left = content.slice(0, sepIdx);
  const right = content.slice(sepIdx + 1);
  return (
    <span style={{ color }}>
      (<InlineMath math={left} />)(<InlineMath math={right} />)
    </span>
  );
}

// Marked variant of PARENMULT: for nonIntegerSolutions.ts's fraction-mode
// reciprocal technique, e.g. "(reciprocal)(coefficient x)" where the
// reciprocal's DENOMINATOR and the coefficient are the actual canceling
// pair (both equal |coefficient| - their product is 1) - the numerator
// "1" isn't part of what's canceling and must stay unmarked. Since the
// reciprocal of a/1 is always 1/|a| with the same sign as a, its display
// is built manually here from `coefficient` alone (parsed for sign and
// magnitude) rather than needing its own separate pre-rendered field -
// same manual-layout technique renderMarkedFraction already uses to mark
// only one part of a stacked fraction, just marking the denominator here
// instead of the numerator.
// Format: "MARKEDPARENMULT:{coefficient}\u0006{variableSymbol}".
const MARKEDPARENMULT_PREFIX = "MARKEDPARENMULT:";

function reciprocalDisplay(coefficient: string, color: string): ReactNode {
  const n = parseInt(coefficient, 10);
  // Sign lives INSIDE the mark now, alongside the denominator - the
  // coefficient's own mark already wraps its sign together with its
  // magnitude (e.g. "-9" as one marked unit), so the reciprocal's own
  // denominator needs the same treatment for the two marks to read as a
  // consistent pair, rather than the coefficient's sign being marked
  // while the reciprocal's own sign is left untouched.
  const denomWithSign = `${n < 0 ? "-" : ""}${Math.abs(n)}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          verticalAlign: "middle",
          margin: "0 2px",
        }}
      >
        <span style={{ paddingBottom: "0.15em" }}>
          <InlineMath math="1" />
        </span>
        <span style={{ borderTop: `0.06em solid ${color}`, alignSelf: "stretch" }} />
        <span style={{ paddingTop: "0.15em" }}>
          <XMark size="large">
            <InlineMath math={denomWithSign} />
          </XMark>
        </span>
      </span>
    </span>
  );
}

function renderMarkedParenMult(content: string, color: string): ReactNode {
  const coefVarSep = content.indexOf(COEF_VAR_SEPARATOR);
  if (coefVarSep === -1) return renderTextWithEmbeddedNumbers(content);
  const coefficient = content.slice(0, coefVarSep);
  const variableSymbol = content.slice(coefVarSep + 1);
  return (
    <span style={{ color, display: "inline-flex", alignItems: "center" }}>
      ({reciprocalDisplay(coefficient, color)})(
      <XMark size="large">
        <InlineMath math={coefficient} />
      </XMark>
      <span style={{ marginLeft: 4, fontSize: "1em" }}>
        <InlineMath math={variableSymbol} />
      </span>
      )
    </span>
  );
}

// Reversed variant - for when the variable term's own column sits on the
// LEFT side of the whole inequality/equation and the constant on the
// right (so the reciprocal needs to sit on the OUTER edge of the whole
// expression, past the variable term, rather than adjacent to it) -
// renders "(coef VAR)(reciprocal)" instead of "(reciprocal)(coef VAR)".
// Same field, same order (coefficient, variableSymbol) - only the VISUAL
// order of the two parenthetical groups is swapped.
// Format: "MARKEDPARENMULTR:{coefficient}\u0006{variableSymbol}".
const MARKEDPARENMULT_REVERSED_PREFIX = "MARKEDPARENMULTR:";

function renderMarkedParenMultReversed(content: string, color: string): ReactNode {
  const coefVarSep = content.indexOf(COEF_VAR_SEPARATOR);
  if (coefVarSep === -1) return renderTextWithEmbeddedNumbers(content);
  const coefficient = content.slice(0, coefVarSep);
  const variableSymbol = content.slice(coefVarSep + 1);
  return (
    <span style={{ color, display: "inline-flex", alignItems: "center" }}>
      (
      <XMark size="large">
        <InlineMath math={coefficient} />
      </XMark>
      <span style={{ marginLeft: 4, fontSize: "1em" }}>
        <InlineMath math={variableSymbol} />
      </span>
      )({reciprocalDisplay(coefficient, color)})
    </span>
  );
}

// Two crossing diagonal lines over whatever's inside - used to show a
// term or a fraction's numerator/denominator has been canceled out,
// matching the handwritten convention of striking through a canceled
// value rather than just showing an annotation below it.
function XMark({ children }: { children: ReactNode; size?: "normal" | "large" }) {
  // The old "normal"/"large" split assumed constant-cancellation marks
  // always wrap WIDER content (a whole term like "+17") than
  // coefficient-cancellation marks (just "-11" alone) - but that breaks
  // whenever the constant itself happens to be a single digit (e.g. "9"),
  // which is just as narrow as any coefficient, and read as
  // disproportionately thin. A proportional, measured reach was tried
  // first, but its timing (useLayoutEffect running before some instances
  // had settled at their final rendered width) produced visibly
  // inconsistent results between two marks on the very same screen. A
  // single, fixed, more generous reach is simpler and renders
  // predictably regardless of the content's own width.
  const inset = -4;
  const thickness = 2.5;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
        <span
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            top: "50%",
            height: thickness,
            background: "var(--coral)",
            transform: "translateY(-50%) rotate(-20deg)",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            top: "50%",
            height: thickness,
            background: "var(--coral)",
            transform: "translateY(-50%) rotate(20deg)",
          }}
        />
      </span>
    </span>
  );
}

// Same manual fraction-bar layout as renderStackedFraction, but for the
// coefficient-cancellation step: the numerator is built from TWO
// separate pieces (coefficient, variable) instead of one continuous
// string, specifically so the x-mark can wrap just the coefficient
// without ever touching the variable next to it. The denominator gets
// its own x-mark too, since that's the same coefficient value doing
// the dividing.
function renderMarkedFraction(content: string, color: string): ReactNode {
  const sepIdx = content.indexOf(STACK_SEPARATOR);
  if (sepIdx === -1) return renderTextWithEmbeddedNumbers(content);
  const numeratorRaw = content.slice(0, sepIdx);
  const denominator = content.slice(sepIdx + 1);
  const coefVarIdx = numeratorRaw.indexOf(COEF_VAR_SEPARATOR);
  const coefficient = coefVarIdx === -1 ? numeratorRaw : numeratorRaw.slice(0, coefVarIdx);
  const variable = coefVarIdx === -1 ? "" : numeratorRaw.slice(coefVarIdx + 1);
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", paddingBottom: "0.1em", lineHeight: 1.15 }}>
        <XMark size="large">
          <InlineMath math={coefficient} />
        </XMark>
        {variable.length > 0 ? (
          <span style={{ marginLeft: 4 }}>
            <InlineMath math={variable} />
          </span>
        ) : null}
      </span>
      <span
        style={{
          borderTop: `0.06em solid ${color}`,
          alignSelf: "stretch",
        }}
      />
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", paddingTop: "0.1em", lineHeight: 1.15 }}>
        <XMark size="large">
          <InlineMath math={denominator} />
        </XMark>
      </span>
    </span>
  );
}

// For the divide-form's coefficient-cancellation step: "(a)(x/a)" or
// "(x/a)(a)" - the outer parenthetical multiplier AND the existing
// fraction's own denominator both get the x-mark (both represent the
// same coefficient value canceling out), while the fraction's
// numerator (containing the variable) stays unmarked. Content format:
// "L|R" (which side the outer multiplier is on) + coef/var separator +
// outer + coef/var separator + numerator + stack separator +
// denominator.
function renderMarkedParenFraction(content: string, color: string): ReactNode {
  const firstSep = content.indexOf(COEF_VAR_SEPARATOR);
  if (firstSep === -1) return renderTextWithEmbeddedNumbers(content);
  const side = content.slice(0, firstSep);
  const rest = content.slice(firstSep + 1);
  const secondSep = rest.indexOf(COEF_VAR_SEPARATOR);
  if (secondSep === -1) return renderTextWithEmbeddedNumbers(rest);
  const outer = rest.slice(0, secondSep);
  const fracContent = rest.slice(secondSep + 1);
  const stackSep = fracContent.indexOf(STACK_SEPARATOR);
  if (stackSep === -1) return renderTextWithEmbeddedNumbers(fracContent);
  const numerator = fracContent.slice(0, stackSep);
  const denominator = fracContent.slice(stackSep + 1);

  const outerMark = (
    <span>
      (
      <XMark size="large">
        <InlineMath math={outer} />
      </XMark>
      )
    </span>
  );
  const fraction = (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      <span style={{ paddingBottom: "0.15em" }}>
        <InlineMath math={numerator} />
      </span>
      <span style={{ borderTop: `0.06em solid ${color}`, alignSelf: "stretch" }} />
      <span style={{ paddingTop: "0.15em" }}>
        <XMark size="large">
          <InlineMath math={denominator} />
        </XMark>
      </span>
    </span>
  );

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {side === "L" ? (
        <>
          {outerMark}
          {fraction}
        </>
      ) : (
        <>
          {fraction}
          {outerMark}
        </>
      )}
    </span>
  );
}

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

// Forces this ONE cell's text-align to "left", overriding the global
// termAlign setting - for a specific term that needs to render flush
// against the left edge of its own column (e.g. a distributed term that
// should sit directly under the original parenthetical expression it
// came from), regardless of how wide some OTHER row sharing that same
// column happens to be. Solves the same problem \mathrlap+\phantom
// attempted (matching a specific sibling's width), but robustly: it
// doesn't depend on knowing the widest sibling across the whole
// problem's lifecycle in advance, which \mathrlap+\phantom could never
// fully guarantee (a later row, like a division-bar setup, can still
// be wider than whatever single width was phantom-matched).
const LEFTALIGN_PREFIX = "LEFTALIGN:";


// Multiplying a fraction coefficient by its reciprocal, with every number
// crossed out once they're confirmed to cancel to 1:
// "(5/4)(4/5)x" -> both 5s and both 4s crossed, the x left alone.
// Format: "MARKEDRECIP:{L|R}\u0006{recipNum}\u0006{recipDen}\u0006{coefNum}\u0006{coefDen}\u0006{variable}"
// (L = reciprocal written first, R = reciprocal written after the term).
const MARKEDRECIP_PREFIX = "MARKEDRECIP:";

function crossedFraction(num: string, den: string, color: string): ReactNode {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", margin: "0 2px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", padding: "0 0.2em 0.1em", lineHeight: 1.15 }}>
        <XMark size="large">
          <InlineMath math={num} />
        </XMark>
      </span>
      <span style={{ borderTop: `0.06em solid ${color}`, alignSelf: "stretch" }} />
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", padding: "0.1em 0.2em 0", lineHeight: 1.15 }}>
        <XMark size="large">
          <InlineMath math={den} />
        </XMark>
      </span>
    </span>
  );
}

function renderMarkedReciprocal(content: string, color: string): ReactNode {
  const [side, rn, rd, cn, cd, v] = content.split(COEF_VAR_SEPARATOR);
  const recip = (
    <>
      (
      {crossedFraction(rn, rd, color)}
      )
    </>
  );
  const term = (
    <>
      {crossedFraction(cn, cd, color)}
      <InlineMath math={v} />
    </>
  );
  return (
    <span style={{ color, display: "inline-flex", alignItems: "center" }}>
      {side === "L" ? (
        <>
          {recip}
          {term}
        </>
      ) : (
        <>
          {term}
          {recip}
        </>
      )}
    </span>
  );
}


// A line that will be divided in place, drawn as a stack from the start:
// "3x" is a stack of 3x over an invisible bar and denominator, the "=" is
// a stack of "=" over nothing, and "3x/3" is the same stack with the bar
// and denominator showing. Every version has the same shape, so when the
// bars and denominators appear, the numbers and "=" stay exactly where
// they were. Same geometry as renderMarkedFraction (the crossed-out
// version that follows).
// Format: "STACKTOP:{0|1 bar shown}\u0005{numerator}\u0005{denominator}".
const STACKTOP_PREFIX = "STACKTOP:";

function renderStackTop(content: string, color: string): ReactNode {
  const [bar, num, den] = content.split(STACK_SEPARATOR);
  const shown = bar === "1";
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle" }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", paddingBottom: "0.1em", lineHeight: 1.15 }}>
        <InlineMath math={num} />
      </span>
      <span style={{ borderTop: `0.06em solid ${color}`, alignSelf: "stretch", visibility: shown ? "visible" : "hidden" }} />
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", paddingTop: "0.1em", lineHeight: 1.15, visibility: shown ? "visible" : "hidden" }}>
        <InlineMath math={den} />
      </span>
    </span>
  );
}


// Every \dfrac gets a digit-height strut in its numerator and denominator,
// so all fractions are the same height whatever is in them ("x" is shorter
// than "3"). Fractions side by side in a line then have their bars at
// exactly the same height.
function strutFractions(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    if (tex.startsWith("\\dfrac{", i)) {
      out += "\\dfrac{\\vphantom{0}";
      i += "\\dfrac{".length;
      // copy the numerator up to its closing brace, then strut the denominator
      let depth = 1;
      let num = "";
      while (i < tex.length && depth > 0) {
        const ch = tex[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth > 0) num += ch;
        i++;
      }
      out += strutFractions(num) + "}";
      if (tex[i] === "{") {
        out += "{\\vphantom{0}";
        i++;
      }
      continue;
    }
    out += tex[i];
    i++;
  }
  return out;
}

// Every bit of math on the page goes through here, so fractions are
// always the same height (see strutFractions).
function InlineMath({ math }: { math: string }) {
  return <KatexInlineMath math={strutFractions(math)} />;
}

function Cell({ math, color, align = "center" }: { math: string; color: string; align?: "center" | "right" | "left" }) {
  const isLeftAlign = math.startsWith(LEFTALIGN_PREFIX);
  const content = isLeftAlign ? math.slice(LEFTALIGN_PREFIX.length) : math;
  const isPlainText = content.startsWith(PLAINTEXT_PREFIX);
  const isStackedFraction = content.startsWith(STACKEDFRACTION_PREFIX);
  const isMarkedTerm = content.startsWith(MARKEDTERM_PREFIX);
  const isMarkedFraction = content.startsWith(MARKEDFRACTION_PREFIX);
  const isMarkedReciprocal = content.startsWith(MARKEDRECIP_PREFIX);
  const isStackTop = content.startsWith(STACKTOP_PREFIX);
  const isMarkedParenFraction = content.startsWith(MARKEDPARENFRACTION_PREFIX);
  const isParenMult = content.startsWith(PARENMULT_PREFIX);
  const isMarkedParenMult = content.startsWith(MARKEDPARENMULT_PREFIX);
  const isMarkedParenMultReversed = content.startsWith(MARKEDPARENMULT_REVERSED_PREFIX);
  const math_ = content;
  return (
    <div
      style={{
        textAlign: isLeftAlign ? "left" : align,
        color,
        overflow: "visible",
        lineHeight: 1.8,
        whiteSpace: "nowrap",
      }}
    >
      {isStackedFraction ? (
        renderStackedFraction(math_.slice(STACKEDFRACTION_PREFIX.length), color)
      ) : isMarkedFraction ? (
        renderMarkedFraction(math_.slice(MARKEDFRACTION_PREFIX.length), color)
      ) : isStackTop ? (
        renderStackTop(math_.slice(STACKTOP_PREFIX.length), color)
      ) : isMarkedReciprocal ? (
        renderMarkedReciprocal(math_.slice(MARKEDRECIP_PREFIX.length), color)
      ) : isMarkedParenFraction ? (
        renderMarkedParenFraction(math_.slice(MARKEDPARENFRACTION_PREFIX.length), color)
      ) : isMarkedParenMultReversed ? (
        renderMarkedParenMultReversed(math_.slice(MARKEDPARENMULT_REVERSED_PREFIX.length), color)
      ) : isMarkedParenMult ? (
        renderMarkedParenMult(math_.slice(MARKEDPARENMULT_PREFIX.length), color)
      ) : isParenMult ? (
        renderParenMult(math_.slice(PARENMULT_PREFIX.length), color)
      ) : isMarkedTerm ? (
        <XMark>
          {math_.slice(MARKEDTERM_PREFIX.length).startsWith(PLAINTEXT_PREFIX) ? (
            // The marked term can itself be a decimal-mode value that
            // repeats (e.g. a constant b whose fraction form has one of
            // the repeating-decimal denominators) - detect the nested
            // PLAINTEXT_PREFIX and render through the same plaintext-
            // with-overline path PLAINTEXT_PREFIX itself uses, rather
            // than passing it to InlineMath/KaTeX, which doesn't
            // understand this prefix or the overline markers at all.
            renderTextWithEmbeddedNumbers(math_.slice(MARKEDTERM_PREFIX.length + PLAINTEXT_PREFIX.length))
          ) : (
            <InlineMath math={math_.slice(MARKEDTERM_PREFIX.length)} />
          )}
        </XMark>
      ) : isPlainText ? (
        renderTextWithEmbeddedNumbers(math_.slice(PLAINTEXT_PREFIX.length))
      ) : (
        <InlineMath math={math_} />
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
// Connects the bottom of one row to the top of another, entirely
// different row - e.g. "this substituted value came from that isolated
// expression above." Unlike DistributeDiagram's arcs (which connect
// cells WITHIN one row via refs), there's no single element to ref here
// ahead of time - a row is just a run of sibling grid cells with no
// wrapping element, and WHICH physical row is at a given slot changes
// as steps reveal. Found instead via data-row-slot attributes scoped to
// the grid container, measured after paint.
// Measures the widest rendered width among a list of KaTeX strings,
// off-screen, and reports it once via onMeasured. Used to lock a grid
// column's width in from the start (based on everything it will EVER
// need to hold, not just what's revealed so far) - the actual fix for
// "the first line keeps sliding sideways as later lines appear," since
// that happens specifically because an auto-sized grid column grows to
// fit its current content and drags everything already in that column
// along with it.
function ColumnWidthMeasurer({ mathStrings, onMeasured }: { mathStrings: string[]; onMeasured: (px: number) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) {
      onMeasured(0);
      return;
    }
    let max = 0;
    for (const child of Array.from(containerRef.current.children)) {
      max = Math.max(max, child.getBoundingClientRect().width);
    }
    onMeasured(max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathStrings.join("|")]);

  return (
    <div ref={containerRef} style={{ position: "fixed", top: -9999, left: -9999, visibility: "hidden", pointerEvents: "none" }}>
      {mathStrings.map((s, i) => (
        <div key={i} style={{ whiteSpace: "nowrap", fontSize: 20, display: "inline-block" }}>
          <InlineMath math={s} />
        </div>
      ))}
    </div>
  );
}

function RowConnector({
  containerRef,
  fromSlotId,
  toSlotId,
}: {
  containerRef: { current: HTMLDivElement | null };
  fromSlotId: string;
  toSlotId: string;
}) {
  const [path, setPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fromEls = Array.from(container.querySelectorAll<HTMLElement>(`[data-row-slot="${fromSlotId}"]`));
    const toEls = Array.from(container.querySelectorAll<HTMLElement>(`[data-row-slot="${toSlotId}"]`));
    if (fromEls.length === 0 || toEls.length === 0) {
      setPath(null);
      return;
    }
    // Anchored to each row's overall horizontal center (union of all its
    // cells), not just its first cell - the isolated variable can sit in
    // either column depending on which variable it is, so the first cell
    // is sometimes blank, which would anchor the arrow to empty space.
    function unionBox(els: HTMLElement[]) {
      const rects = els.map((e) => e.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { top, bottom, centerX: (left + right) / 2 };
    }
    const containerRect = container.getBoundingClientRect();
    const from = unionBox(fromEls);
    const to = unionBox(toEls);
    const startX = from.centerX - containerRect.left;
    const startY = from.bottom - containerRect.top;
    const endX = to.centerX - containerRect.left;
    const endY = to.top - containerRect.top;
    const midY = (startY + endY) / 2;
    setPath(`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY - 6}`);
  }, [containerRef, fromSlotId, toSlotId]);

  if (!path) return null;
  return (
    <svg
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <marker id="rowConnectorArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--ink-soft)" />
        </marker>
      </defs>
      <path d={path} stroke="var(--ink-soft)" strokeWidth="1.3" fill="none" markerEnd="url(#rowConnectorArrow)" />
    </svg>
  );
}

function DistributeDiagram({
  coefficient,
  term1,
  term2,
  arcsShown,
  prefix,
  prefixColor,
  suffix,
  suffixColor,
  parenColor,
  forcePaddingTop,
}: {
  coefficient: string;
  term1: string;
  term2: string;
  arcsShown: 0 | 1 | 2;
  prefix?: string;
  prefixColor?: string;
  suffix?: string;
  suffixColor?: string;
  parenColor?: string;
  // Overrides this diagram's own arcsShown-based padding - needed when
  // TWO diagrams share the same row (a left-side and a right-side one,
  // both simultaneously visible): each computes arcsShown independently
  // for ITS OWN arcs, so without this, the one further behind pads
  // less, and its text sits at a different baseline than the other -
  // the whole row needs the same padding as whichever diagram (or
  // neither) currently has the most arcs shown.
  forcePaddingTop?: number;
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
  // arcsShown is ALSO a dependency, not just the token strings - the
  // container's own paddingTop changes (0 before any arc, 34 once one is
  // shown), which shifts the text's actual Y position in the DOM. Without
  // re-measuring here, the arc math keeps using the stale pre-padding Y
  // coordinate, drawing arcs disconnected from where the text now sits.
  // forcePaddingTop is the same reasoning, one level removed: when a
  // sibling diagram on the same row forces this one's padding to match
  // its own (larger) value, that ALSO shifts this text's actual Y
  // position, even though this diagram's own arcsShown didn't change.
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
  }, [coefficient, term1, term2, arcsShown, forcePaddingTop]);

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
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-block",
        paddingTop: forcePaddingTop !== undefined ? forcePaddingTop : arcsShown > 0 ? 34 : 0,
      }}
    >
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
      <div style={{ display: "flex", alignItems: "baseline", fontSize: 20 }}>
        {prefix && (
          <span style={{ marginRight: 4, color: prefixColor }}>
            <InlineMath math={prefix} />
          </span>
        )}
        <span ref={coefRef}>
          <InlineMath math={coefficient} />
        </span>
        <span style={{ color: parenColor }}>
          <InlineMath math="(" />
        </span>
        <span ref={term1Ref}>
          <InlineMath math={term1} />
        </span>
        <span ref={term2Ref} style={{ marginLeft: 4 }}>
          <InlineMath math={term2} />
        </span>
        <span style={{ color: parenColor }}>
          <InlineMath math=")" />
        </span>
        {suffix && (
          <span style={{ marginLeft: 4, color: suffixColor }}>
            <InlineMath math={suffix} />
          </span>
        )}
      </div>
    </div>
  );
}

type ComputedAnnotation = {
  coefficient: string;
  term1: string;
  term2: string;
  arcsShown: 0 | 1 | 2;
  termCols: [number, number];
  targetSlotId: string;
  prefix?: string;
  prefixColor?: string;
  suffix?: string;
  suffixColor?: string;
};

// eqColumnIndex marks the position of the "=" sign within a row's cells,
// not a fixed offset from the total cell count - what it implies about
// total cell count depends on orientation. expressionLeft-style rows
// (2-term standard, eqColumnIndex=2, or substitution's 3-term
// extension, eqColumnIndex=3) put "=" second-to-last, so total cells =
// eqColumnIndex+2 holds correctly. expressionRight-style rows
// (eqColumnIndex=1) put the constant BEFORE "=" and both expression
// terms AFTER it instead - still 4 total cells, not eqColumnIndex+2=3.
// Only eqColumnIndex=1 is ever produced for expressionRight (no 3+-term
// variant of it currently exists), so this single special case covers
// every real usage without needing every skill file to pass its own
// total column count explicitly.
// Wraps one cell's math in bold - used for the row that turns bold
// mid-problem (SolverInstance.boldAfter). Special-format cells are left
// as-is, since their prefixes have to stay at the very start.
function boldWrapCell(math: string): string {
  if (
    !math ||
    math.startsWith(PLAINTEXT_PREFIX) ||
    math.startsWith(STACKEDFRACTION_PREFIX) ||
    math.startsWith(MARKEDTERM_PREFIX) ||
    math.startsWith(MARKEDFRACTION_PREFIX) ||
    math.startsWith(MARKEDPARENFRACTION_PREFIX) ||
    math.startsWith(MARKEDPARENMULT_PREFIX) ||
    math.startsWith(MARKEDPARENMULT_REVERSED_PREFIX) ||
    math.startsWith(PARENMULT_PREFIX) ||
    math.startsWith(LEFTALIGN_PREFIX)
  )
    return math;
  return `\\boldsymbol{${math}}`;
}

function totalGridColumns(eqColumnIndex: number, columnCountOverride?: number): number {
  if (columnCountOverride !== undefined) return columnCountOverride;
  return eqColumnIndex === 1 ? 4 : eqColumnIndex + 2;
}

function EquationGrid({
  rows,
  slotIds,
  fullRows,
  fullSlotIds,
  boldSlotId,
  eqColumnIndex,
  columnCount,
  distributeAnnotations,
  eq1Annotation,
  eq2Annotation,
  termAlign,
  rowConnectors,
  pairedLayout,
  trackLayout,
  arcReserveKeys,
}: {
  rows: (GridRow | PairedGridRow)[];
  slotIds: string[];
  fullRows?: (GridRow | PairedGridRow)[];
  fullSlotIds?: string[];
  boldSlotId?: string | null;
  eqColumnIndex: number;
  columnCount?: number;
  distributeAnnotations?: ComputedAnnotation[];
  eq1Annotation?: ComputedAnnotation;
  eq2Annotation?: ComputedAnnotation;
  termAlign?: "right";
  rowConnectors?: { fromSlotId: string; toSlotId: string }[];
  pairedLayout?: "sideBySide";
  trackLayout?: { leftSlotIds: string[]; rightSlotIds: string[] };
  // "slotId|equation" for every row that will ever carry distribute arrows.
  arcReserveKeys?: Set<string>;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);

  function alignFor(_colIndex: number): "center" | "right" | "left" {
    return termAlign ?? "center";
  }

  function colorFor(highlight: "success" | "phase-blue" | "phase-green" | "phase-red" | undefined): string {
    if (highlight === "success" || highlight === "phase-green") return "var(--green)";
    if (highlight === "phase-blue") return "var(--blue)";
    if (highlight === "phase-red") return "var(--coral)";
    return "var(--ink)";
  }

  // Renders every cell from every row this problem will EVER show
  // (fullRows), invisibly, at zero height, overlapping row 1 - so CSS
  // grid's own auto-column-sizing (which sizes each column from the
  // intrinsic width of every cell sharing it, regardless of which row
  // that cell is actually in) accounts for the full range of widths a
  // column will ever need from the very first render. Without this,
  // each column's width is computed only from whatever's been revealed
  // SO FAR - so a later step revealing wider or narrower content in a
  // column recomputes that column's width, visibly shifting everything
  // already on screen in it. This fixes that at the root, using CSS
  // grid's own native sizing mechanism rather than trying to compute or
  // guess pixel widths by hand: multiple items can occupy the same grid
  // cell position (they simply overlap), so placing every candidate
  // width at gridRow 1 lets the browser's own layout engine pick
  // whichever is actually widest, the same way it already does for
  // currently-visible rows sharing a column - just extended to include
  // rows that haven't appeared yet too. `visibility: hidden` (not
  // display: none) is what keeps these participating in layout sizing
  // while contributing nothing visible; `height: 0` on each cell is what
  // keeps them from adding any vertical space of their own, even when
  // their content (e.g. a stacked fraction) is taller than row 1's own
  // actual content.
  function renderSizingProbe(flowFullRows: (GridRow | PairedGridRow)[] | undefined) {
    if (!flowFullRows) return null;
    return flowFullRows.flatMap((row, rowIndex) => {
      if (isPairedRow(row)) {
        // A paired row's two equations (eq1/eq2) share the SAME column
        // structure as every regular row in this same flow (that's what
        // keeps a paired row's columns aligned with the rows around it
        // to begin with) - both need to contribute their own widths to
        // the probe, not just whichever a regular GridRow happens to be.
        return [...row.eq1, ...row.eq2].map((cellValue, cellIdx) => (
          <div
            key={`probe-${rowIndex}-paired-${cellIdx}`}
            aria-hidden="true"
            style={{
              gridRow: 1,
              gridColumn: (cellIdx % row.eq1.length) + 1,
              height: 0,
              overflow: "hidden",
              visibility: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <Cell math={cellValue} color="var(--ink)" align={termAlign} />
          </div>
        ));
      }
      if (row.caption !== undefined) return [];
      return row.cells.map((cellValue, colIndex) => (
        <div
          key={`probe-${rowIndex}-${colIndex}`}
          aria-hidden="true"
          style={{
            gridRow: 1,
            gridColumn: colIndex + 1,
            height: 0,
            overflow: "hidden",
            visibility: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <Cell math={cellValue} color="var(--ink)" align={termAlign} />
        </div>
      ));
    });
  }

  // Renders one flow of rows (the whole problem normally, or ONE track's
  // slice of it in two-track mode) into the flat cell array a CSS grid
  // needs. Pulled out so it can be called once for the normal case or
  // twice - once per independent track - without duplicating this much
  // logic, since each track needs its own genuinely separate grid
  // (its own column-width calculation), not just a visual split of one
  // shared grid.
  function renderRowFlow(flowRows: (GridRow | PairedGridRow)[], flowSlotIds: string[]) {
    return flowRows.flatMap((row, rowIndex) => {
      const slotId = flowSlotIds[rowIndex];

      if (!isPairedRow(row) && row.caption !== undefined) {
        return [
          <div
            key={`${rowIndex}-caption`}
            data-row-slot={slotId}
            style={{
              gridColumn: `1 / span ${totalGridColumns(eqColumnIndex, columnCount)}`,
              textAlign: "center",
              color: colorFor(row.highlight),
              fontWeight: 700,
              fontSize: 22,
              whiteSpace: "normal",
              padding: "4px 0",
            }}
          >
            {row.caption}
          </div>,
        ];
      }

      // Renders one equation's 4 cells (used directly for a normal
      // single-equation row, and twice - once per equation - for a
      // paired row). Cells stay in the SAME repeat(4,auto) grid track
      // structure either way, which is what keeps a paired row's
      // columns aligned with every single-equation row above or below
      // it within the SAME flow. `marginBottom` tightens the gap
      // between the two equations of a pair specifically, without
      // touching the grid's own rowGap (which stays uniform for every
      // other row boundary).
      const boldWrap = boldWrapCell;

      function renderCells(
        cells: readonly string[],
        rowKey: string,
        color: string,
        slotIdForRow: string | undefined,
        marginBottom?: number,
        padTop: number = 0
      ) {
        const isBold = !!slotIdForRow && slotIdForRow === boldSlotId;
        return cells.map((cellValue, colIndex) => {
          const style =
            marginBottom !== undefined || padTop
              ? { ...(marginBottom !== undefined ? { marginBottom } : {}), ...(padTop ? { paddingTop: padTop } : {}) }
              : undefined;
          const displayValue = isBold ? boldWrap(cellValue) : cellValue;
          if (colIndex === eqColumnIndex) {
            return (
              <div
                key={`${rowKey}-${colIndex}`}
                data-row-slot={slotIdForRow}
                style={{
                  textAlign: "center",
                  color: "var(--ink-soft)",
                  fontSize: 18,
                  whiteSpace: "nowrap",
                  ...style,
                }}
              >
                {displayValue.length > 0 ? <InlineMath math={displayValue} /> : null}
              </div>
            );
          }
          return (
            <div key={`${rowKey}-${colIndex}`} data-row-slot={slotIdForRow} style={style}>
              <Cell math={displayValue} color={color} align={alignFor(colIndex)} />
            </div>
          );
        });
      }

      // Same idea as the parentheses skill's row-0 spanning arrow cell,
      // generalized to work for either a plain row's cells or one
      // equation's cells within a paired row: when an annotation is
      // present, the two term columns merge into one spanning cell
      // containing the arrow diagram instead of rendering normally.
      function renderCellsOrArrow(
        cells: readonly string[],
        rowKey: string,
        color: string,
        annotations: ComputedAnnotation[],
        slotIdForRow: string | undefined,
        marginBottom?: number,
        reserveArcSpace: boolean = false
      ) {
        // A row that will EVER carry distribute arrows keeps their 34px of
        // headroom from the moment it appears, so the arrows showing up
        // later never push this row (and everything below it) down.
        if (annotations.length === 0) {
          return renderCells(cells, rowKey, color, slotIdForRow, marginBottom, reserveArcSpace ? 34 : 0);
        }
        // Multiple annotations can be simultaneously active on the same
        // row now (e.g. both a left-side and a right-side distribute
        // diagram, once each has started) - each one still spans its
        // own two term columns independently, keyed by its own
        // termCols, rather than only ever one being shown at a time.
        const spanStartCols = new Set(annotations.map((a) => Math.min(...a.termCols)));
        const spanAbsorbedCols = new Set(annotations.map((a) => Math.min(...a.termCols) + 1));
        // The "=" column's own padding needs to match whichever
        // diagram(s) currently have at least one arc visible - if ANY
        // of them do, this row's baseline has already shifted down by
        // 34px, and every other cell in the row (including this one)
        // needs the same shift to stay aligned with it.
        const anyArcsShown = reserveArcSpace || annotations.some((a) => a.arcsShown > 0);
        return cells.map((cellValue, colIndex) => {
          const style = marginBottom !== undefined ? { marginBottom } : undefined;
          if (spanStartCols.has(colIndex)) {
            const annotation = annotations.find((a) => Math.min(...a.termCols) === colIndex)!;
            return (
              <div
                key={`${rowKey}-${colIndex}`}
                data-row-slot={slotIdForRow}
                style={{ gridColumn: `${colIndex + 1} / span 2`, ...style }}
              >
                <DistributeDiagram
                  coefficient={annotation.coefficient}
                  term1={annotation.term1}
                  term2={annotation.term2}
                  arcsShown={annotation.arcsShown}
                  prefix={annotation.prefix}
                  prefixColor={annotation.prefixColor}
                  suffix={annotation.suffix}
                  suffixColor={annotation.suffixColor}
                  parenColor={color}
                  forcePaddingTop={anyArcsShown ? 34 : 0}
                />
              </div>
            );
          }
          if (spanAbsorbedCols.has(colIndex)) return null; // absorbed into the spanning cell above
          // Matches DistributeDiagram's own paddingTop exactly (0 before
          // any arc is shown, 34 once one is), so these cells sit at the
          // same baseline as the equation text inside the spanning cell,
          // instead of the two falling out of alignment with each other.
          const paddedStyle = { paddingTop: anyArcsShown ? 34 : 0, ...style };
          return colIndex === eqColumnIndex ? (
            <div key={`${rowKey}-${colIndex}`} data-row-slot={slotIdForRow} style={paddedStyle}>
              <div style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 18, whiteSpace: "nowrap" }}>
                {cellValue.length > 0 ? <InlineMath math={cellValue} /> : null}
              </div>
            </div>
          ) : (
            <div key={`${rowKey}-${colIndex}`} data-row-slot={slotIdForRow} style={paddedStyle}>
              <Cell math={cellValue} color={color} align={alignFor(colIndex)} />
            </div>
          );
        });
      }

      if (isPairedRow(row)) {
        const eq1Ann = eq1Annotation?.targetSlotId === slotId ? eq1Annotation : undefined;
        const eq2Ann = eq2Annotation?.targetSlotId === slotId ? eq2Annotation : undefined;

        if (rowIndex === 0 && pairedLayout === "sideBySide") {
          function miniGrid(cells: readonly string[], color: string, key: string) {
            return (
              <div
                key={key}
                data-row-slot={slotId}
                style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, auto)`, columnGap: 10, alignItems: "center" }}
              >
                {cells.map((cellValue, colIndex) =>
                  colIndex === eqColumnIndex ? (
                    <div key={colIndex} style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 18, whiteSpace: "nowrap" }}>
                      {cellValue.length > 0 ? <InlineMath math={cellValue} /> : null}
                    </div>
                  ) : (
                    <Cell key={colIndex} math={cellValue} color={color} align={termAlign} />
                  )
                )}
              </div>
            );
          }
          return [
            <div key={`${rowIndex}-sidebyside`} style={{ gridColumn: "1 / span 4", display: "flex", gap: 48, flexWrap: "wrap" }}>
              {miniGrid(row.eq1, colorFor(row.eq1Highlight), "eq1")}
              {miniGrid(row.eq2, colorFor(row.eq2Highlight), "eq2")}
            </div>,
          ];
        }

        return [
          ...renderCellsOrArrow(row.eq1, `${rowIndex}-eq1`, colorFor(row.eq1Highlight), eq1Ann ? [eq1Ann] : [], slotId, -8, !!arcReserveKeys?.has(`${slotId}|eq1`)),
          ...renderCellsOrArrow(row.eq2, `${rowIndex}-eq2`, colorFor(row.eq2Highlight), eq2Ann ? [eq2Ann] : [], slotId, undefined, !!arcReserveKeys?.has(`${slotId}|eq2`)),
        ];
      }

      const color = colorFor(row.highlight);
      // The row whose slot id matches an annotation's targetSlotId gets
      // that annotation's two term columns merged into one spanning cell
      // containing the arrow diagram - this is what makes the arrow sit
      // directly on the actual equation line it belongs to, wherever
      // that row happens to be (and whichever track it's in), instead of
      // always landing on row 0 regardless of which row it was meant
      // for. Defaults to "__initial__" (row 0) for skills that never set
      // targetSlotId, preserving existing behavior exactly. More than
      // one annotation can match the SAME row now (e.g. a left-side and
      // a right-side distribute diagram both belonging on row 0) -
      // renderCellsOrArrow renders each independently, at its own
      // column span.
      const matchingAnnotations = (distributeAnnotations ?? []).filter((a) => a.targetSlotId === slotId);
      return renderCellsOrArrow(row.cells, `${rowIndex}`, color, matchingAnnotations, slotId, row.marginBottom, !!arcReserveKeys?.has(`${slotId}|`));
    });
  }

  const connectorsToRender = (rowConnectors ?? []).filter((rc) => slotIds.includes(rc.fromSlotId) && slotIds.includes(rc.toSlotId));

  if (trackLayout) {
    const leftSet = new Set(trackLayout.leftSlotIds);
    const rightSet = new Set(trackLayout.rightSlotIds);

    function splitByTrack(rowsIn: (GridRow | PairedGridRow)[], idsIn: string[]) {
      const left: (GridRow | PairedGridRow)[] = [];
      const leftI: string[] = [];
      const right: (GridRow | PairedGridRow)[] = [];
      const rightI: string[] = [];
      const rest: (GridRow | PairedGridRow)[] = [];
      const restI: string[] = [];
      rowsIn.forEach((row, i) => {
        const id = idsIn[i];
        if (isPairedRow(row)) {
          left.push({ cells: row.eq1, highlight: row.eq1Highlight });
          leftI.push(id);
          right.push({ cells: row.eq2, highlight: row.eq2Highlight });
          rightI.push(id);
        } else if (leftSet.has(id)) {
          left.push(row);
          leftI.push(id);
        } else if (rightSet.has(id)) {
          right.push(row);
          rightI.push(id);
        } else {
          rest.push(row);
          restI.push(id);
        }
      });
      return { left, leftI, right, rightI, rest, restI };
    }

    const { left: leftRows, leftI: leftIds, right: rightRows, rightI: rightIds, rest: unassignedRows, restI: unassignedIds } = splitByTrack(
      rows,
      slotIds
    );

    // The SAME split, applied to every row this problem will EVER show
    // (fullRows/fullSlotIds), not just what's revealed so far - each
    // track gets its own genuinely independent column-width calculation
    // (a separate grid per track), so each one needs its own full-row
    // split fed into its own sizing probe below, not one shared set.
    const {
      left: fullLeftRows,
      right: fullRightRows,
      rest: fullUnassignedRows,
    } = splitByTrack(fullRows ?? [], fullSlotIds ?? []);

    return (
      <div style={{ overflowX: "auto", width: "100%", paddingTop: 14, paddingBottom: 4 }}>
        <div ref={outerRef} style={{ position: "relative" }}>
          {connectorsToRender.map((rc, i) => (
            <RowConnector key={i} containerRef={outerRef} fromSlotId={rc.fromSlotId} toSlotId={rc.toSlotId} />
          ))}
          <div style={{ display: "flex", gap: 48, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${totalGridColumns(eqColumnIndex, columnCount)}, auto)`,
                columnGap: 10,
                rowGap: 20,
                alignItems: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {renderSizingProbe(fullLeftRows)}
              {renderRowFlow(leftRows, leftIds)}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${totalGridColumns(eqColumnIndex, columnCount)}, auto)`,
                columnGap: 10,
                rowGap: 20,
                alignItems: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {renderSizingProbe(fullRightRows)}
              {renderRowFlow(rightRows, rightIds)}
            </div>
          </div>
          {unassignedRows.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${totalGridColumns(eqColumnIndex, columnCount)}, auto)`,
                columnGap: 10,
                rowGap: 20,
                alignItems: "center",
                fontSize: 20,
                marginTop: 20,
              }}
            >
              {renderSizingProbe(fullUnassignedRows)}
              {renderRowFlow(unassignedRows, unassignedIds)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", width: "100%", paddingTop: 14, paddingBottom: 4 }}>
      <div
        ref={outerRef}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${totalGridColumns(eqColumnIndex, columnCount)}, auto)`,
          width: "fit-content",
          columnGap: 10,
          rowGap: 20,
          alignItems: "center",
          fontSize: 20,
          position: "relative",
        }}
      >
        {renderSizingProbe(fullRows)}
        {connectorsToRender.map((rc, i) => (
          <RowConnector key={i} containerRef={outerRef} fromSlotId={rc.fromSlotId} toSlotId={rc.toSlotId} />
        ))}
        {renderRowFlow(rows, slotIds)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anchored layout (every skill except systems of equations)
//
// Each line is laid out on its OWN, compactly - spaced the way the same
// equation looks when typed into the math editor (TeX spacing) - instead
// of sharing column widths with every other line (which let a wide later
// line open big gaps inside earlier ones). Lines still never move:
//   * Every line's "=" sits at the same spot, fixed from the first step:
//     the left side grows LEFT from "=", the right side grows RIGHT from
//     it, and the space reserved on each side is the widest any line in
//     the problem will ever need (an invisible "probe" copy of each line).
//   * A line that changes in place (cross-outs, a multiplier appearing,
//     distribution filling in term by term) is sized for every version
//     it will ever take, so nothing inside it shifts either.
//   * Annotation lines (no "=", e.g. "-14 ... -14" written under both
//     sides) share their column positions with the line right above them,
//     so each annotation sits directly under the term it cancels.
// ---------------------------------------------------------------------------

// TeX's own spacing at KaTeX's size for this grid (20px x 1.21 scale):
// medium space (4mu) around + and -, thick space (5mu) around =.
const MATH_EM = 20 * 1.21;
const TEX_MED_SPACE = (MATH_EM * 4) / 18;
const TEX_THICK_SPACE = (MATH_EM * 5) / 18;

function isBlankCell(c: string | undefined): boolean {
  if (c === undefined) return true;
  const t = c.replace(/^(LEFTALIGN:|MARKEDTERM:)+/, "").trim();
  return t === "" || t === "\\phantom{0}";
}

// The skills put a fixed 0.5em gap after a leading sign ("+ 14") - here it
// becomes TeX's medium space, the same gap the editor (and KaTeX) put
// around a + or - between two terms.
function texSpacing(c: string): string {
  return (
    c
      // A sign that starts the cell ("+ 14"): KaTeX sees it as a lone
      // sign, so the gap after it is put in explicitly.
      .replace(/^((?:[A-Z]+:)*\u0003?)([+-])\\hspace\{0\.5em\}/, "$1$2\\:")
      // Anywhere else ("2x + 115" inside one cell) KaTeX already spaces
      // the + itself - an extra gap would double it.
      .replace(/\\hspace\{0\.5em\}/g, "")
  );
}

// A term after the first on its side that starts with a sign ("-12a" in
// "11 -12a") is joined to the term before it, so it gets the same gap after
// the sign as every other term ("11 - 12a") even if the cell didn't spell it
// out.
function spaceJoiningSign(c: string): string {
  return c.replace(/^((?:[A-Z]+:)*\u0003?)([+-])(?!\\:|\\hspace)/, "$1$2\\:");
}

// "First term never gets a forced sign": the first visible term on each
// side of a real equation line shows its natural sign - "36", "-9" - never
// "+ 36" or "- 9", even when the term that used to come before it has
// since been eliminated. (Annotation lines like "+12" under both sides
// keep their sign; it's the point of them.)
// An annotation term stands alone ("-5x" written under both sides), so its
// sign hugs it - every skill writes them that way, but a few include a gap.
function tightSign(c: string): string {
  return c.replace(/^((?:[A-Z]+:)*\u0003?)([+-])(?:\\:|\\hspace\{0\.5em\})/, "$1$2");
}

function naturalSign(c: string): string {
  return c
    .replace(/^((?:[A-Z]+:)*\u0003?)\+(?:\\:|\\hspace\{0\.5em\})?/, "$1")
    .replace(/^((?:[A-Z]+:)*\u0003?)-(?:\\:|\\hspace\{0\.5em\})/, "$1-");
}


// Proportions: two crossing loops, each circling one diagonal pair of a
// row that is one fraction = one fraction (top-left with bottom-right,
// bottom-left with top-right). Measured from the rendered fractions, drawn
// as an overlay so the row itself never moves or resizes.
function CrossLoops({ containerRef, slotId, color }: { containerRef: { current: HTMLDivElement | null }; slotId: string; color: string }) {
  const [loops, setLoops] = useState<{ cx: number; cy: number; rx: number; ry: number; angle: number }[]>([]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const fracs = Array.from(container.querySelectorAll<HTMLElement>(`[data-row-slot="${slotId}"] .mfrac`));
      if (fracs.length < 2) return setLoops([]);
      const base = container.getBoundingClientRect();
      // Center of the numerator and the denominator of one fraction.
      const parts = (frac: HTMLElement) => {
        const pieces = Array.from(frac.querySelectorAll<HTMLElement>(".vlist > span"))
          .filter((el) => (el.textContent ?? "").trim() !== "")
          .map((el) => (el.lastElementChild as HTMLElement | null) ?? el)
          .map((el) => el.getBoundingClientRect())
          .sort((a, b) => a.top - b.top);
        const c = (r: DOMRect) => ({ x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, w: r.width, h: r.height });
        return { top: c(pieces[0]), bottom: c(pieces[pieces.length - 1]) };
      };
      const L = parts(fracs[0]);
      const R = parts(fracs[fracs.length - 1]);
      const loop = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const pad = Math.max(a.w, b.w) / 2 + 12;
        return {
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          rx: len / 2 + pad,
          ry: Math.max(a.h, b.h) / 2 + 9,
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        };
      };
      setLoops([loop(L.top, R.bottom), loop(L.bottom, R.top)]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [containerRef, slotId]);
  if (loops.length === 0) return null;
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
    >
      <style>{`@keyframes mm-loop-draw { from { stroke-dashoffset: 1.05; } to { stroke-dashoffset: 0; } }`}</style>
      {loops.map((l, i) => (
        <ellipse
          key={i}
          cx={l.cx}
          cy={l.cy}
          rx={l.rx}
          ry={l.ry}
          transform={`rotate(${l.angle} ${l.cx} ${l.cy})`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          pathLength={1}
          strokeDasharray={1.05}
          style={{ animation: `mm-loop-draw 0.6s ease-out ${i * 0.35}s both` }}
        />
      ))}
    </svg>
  );
}

function AnchoredEquation({
  rows,
  slotIds,
  slotVersions,
  slotOrderAll,
  eqColumnIndex,
  distributeAnnotations,
  arcReserveSlots,
  crossLoops,
}: {
  rows: GridRow[];
  slotIds: string[];
  slotVersions: Record<string, GridRow[]>;
  slotOrderAll: string[];
  eqColumnIndex: number;
  distributeAnnotations: ComputedAnnotation[];
  arcReserveSlots: Set<string>;
  crossLoops?: { slotId: string; shown: boolean };
}) {
  const e = eqColumnIndex;
  const gridRef = useRef<HTMLDivElement>(null);
  // The proportion row is spread out around its "=" from the very first
  // step, so the cross-multiply loops are long and thin (like drawing them
  // by hand) and each one circles only its own two numbers.
  const loopGap = (slotId: string) => (crossLoops && crossLoops.slotId === slotId ? 26 : undefined);

  // A line written under another (like "-11" under "12") lines up with the
  // right edge of the term above it and may stick out further left than
  // anything else. Every line is already laid out (hidden ones too), so
  // measure how far the work reaches past the left edge and leave that
  // much room - from the first step, so nothing is ever cut off and
  // nothing moves.
  const [overhang, setOverhang] = useState(0);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const left = grid.getBoundingClientRect().left;
      let min = 0;
      grid.querySelectorAll<HTMLElement>(".katex").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0) min = Math.min(min, r.left - left);
      });
      setOverhang(min < 0 ? Math.ceil(-min) + 2 : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [slotOrderAll.join("|")]);

  // Fractions drawn by hand (crossed-out numbers, reciprocals) and KaTeX's
  // own fractions can land a pixel or two apart on the same line. After
  // every update, nudge each hand-drawn fraction so its bar sits at exactly
  // the height of the KaTeX fraction bar on that line. (A visual nudge only
  // - it doesn't change the layout, so nothing else moves.)
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const bySlot: Record<string, HTMLElement[]> = {};
    grid.querySelectorAll<HTMLElement>("[data-row-slot]").forEach((el) => {
      (bySlot[el.getAttribute("data-row-slot")!] ||= []).push(el);
    });
    for (const els of Object.values(bySlot)) {
      const katexBar = els.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>(".frac-line")))[0];
      const bars = els.flatMap((el) =>
        Array.from(el.querySelectorAll<HTMLElement>("span")).filter((sp) => sp.style.borderTop.includes("solid"))
      );
      for (const bar of bars) {
        const stack = bar.parentElement as HTMLElement;
        stack.style.transform = "";
        if (!katexBar) continue;
        const delta = katexBar.getBoundingClientRect().top - bar.getBoundingClientRect().top;
        if (Math.abs(delta) > 0.25 && Math.abs(delta) < 8) stack.style.transform = `translateY(${delta}px)`;
      }
    }
  });

  // A line that later gets divided in place ("3x = 21" becoming
  // "3x/3 = 21/3") is drawn at the top of its space from the start, so
  // when the fraction bars and denominators appear they're simply added
  // underneath - the numbers and "=" stay exactly where they were.
  const isDivision = (c: string) => /^\\dfrac\{[^{}]*\}\{[^{}]*\}$/.test(c) || c.startsWith("MARKEDFRACTION:");
  const hasFraction = (c: string) => /\\dfrac|\\frac|MARKEDFRACTION:|MARKEDPARENFRACTION:|STACKEDFRACTION:|MARKEDRECIP:/.test(c);
  const topAligned = new Set(
    slotOrderAll.filter((id) => {
      const versions = (slotVersions[id] ?? []).filter((r) => r.caption === undefined);
      // The line is written out (possibly a piece at a time) with no
      // fractions, then divided: the first fractioned version divides
      // every term of the last plain one, and nothing else.
      const firstFrac = versions.findIndex((r) => r.cells.some(hasFraction));
      if (firstFrac < 1) return false;
      const flat = versions[firstFrac - 1];
      if (versions.slice(0, firstFrac).some((r) => r.cells.some((c) => /^[A-Z]+:/.test(c)))) return false;
      // Every later version is exactly that division (plain, or with the
      // canceled numbers crossed out).
      return versions
        .slice(firstFrac)
        .every((d) => d.cells.every((c, i) => i === e || (isBlankCell(flat.cells[i]) ? isBlankCell(c) : isDivision(c))));
    })
  );

  // Denominator each column of a top-aligned line will get, so the flat
  // version can hold that space (invisibly) from the start.
  const futureDen: Record<string, Record<number, string>> = {};
  for (const id of topAligned) {
    const d = (slotVersions[id] ?? []).find((r) => r.cells.some(hasFraction));
    futureDen[id] = {};
    d?.cells.forEach((c, i) => {
      const m = c.match(/^\\dfrac\{(.*)\}\{(.*)\}$/);
      if (m) futureDen[id][i] = m[2];
      else if (c.startsWith("MARKEDFRACTION:")) futureDen[id][i] = c.slice(c.indexOf("\u0005") + 1);
    });
  }
  const SEP = "\u0005";
  function topify(c: string, slotId: string | undefined, col: number): string {
    if (!slotId || !topAligned.has(slotId) || isBlankCell(c) || c.startsWith("MARKEDFRACTION:")) return c;
    if (col === e) return `STACKTOP:0${SEP}${c}${SEP}0`;
    const m = c.match(/^\\dfrac\{(.*)\}\{(.*)\}$/);
    if (m) return `STACKTOP:1${SEP}${m[1]}${SEP}${m[2]}`;
    return `STACKTOP:0${SEP}${c}${SEP}${futureDen[slotId][col] ?? "0"}`;
  }

  function colorFor(highlight: GridRow["highlight"]): string {
    if (highlight === "success" || highlight === "phase-green") return "var(--green)";
    if (highlight === "phase-blue") return "var(--blue)";
    if (highlight === "phase-red") return "var(--coral)";
    return "var(--ink)";
  }

  // Annotation line = never has an "=" (or other relation) in any version.
  const isAnnotationSlot = (id: string) =>
    (slotVersions[id] ?? []).every((r) => r.caption === undefined && (r.cells[e] ?? "") === "");

  // Group = a line plus the annotation lines directly under it; they share
  // one set of column positions.
  const groupOf: Record<string, string> = {};
  const groupSlots: Record<string, string[]> = {};
  let anchor = slotOrderAll[0];
  for (const id of slotOrderAll) {
    if (!isAnnotationSlot(id)) anchor = id;
    groupOf[id] = anchor;
    (groupSlots[anchor] ??= []).push(id);
  }

  // Columns actually used on each side of each group (a column that's
  // blank in every version takes no space at all).
  function usedCols(group: string, side: "left" | "right"): number[] {
    const versions = groupSlots[group].flatMap((id) => slotVersions[id] ?? []).filter((r) => r.caption === undefined);
    const width = versions[0]?.cells.length ?? 0;
    const cols: number[] = [];
    for (let c = 0; c < width; c++) {
      if (side === "left" ? c >= e : c <= e) continue;
      if (versions.some((r) => !isBlankCell(r.cells[c]))) cols.push(c);
    }
    return cols;
  }

  function SideBlock({
    group,
    side,
    row,
    slotId,
    probeOnly,
    hidden,
  }: {
    group: string;
    side: "left" | "right";
    row?: GridRow;
    slotId?: string;
    probeOnly?: boolean;
    hidden?: boolean; // a line not revealed yet - holds its space only
  }) {
    const dataSlot = hidden ? undefined : slotId;
    const cols = usedCols(group, side);
    const align = side === "left" ? "right" : "left";
    // Only real equation lines size the columns - an annotation line under
    // them never widens them (that would open gaps in the line above).
    const versions = groupSlots[group]
      .filter((id) => !isAnnotationSlot(id))
      .flatMap((id) => slotVersions[id] ?? [])
      .filter((r) => r.caption === undefined);
    const isAnnotation = !!slotId && isAnnotationSlot(slotId);
    const color = row ? colorFor(row.highlight) : "var(--ink)";
    const annotations = row && slotId ? distributeAnnotations.filter((a) => a.targetSlotId === slotId) : [];
    const reserve = !!slotId && arcReserveSlots.has(slotId);
    const padTop = reserve || annotations.some((a) => a.arcsShown > 0) ? 34 : 0;
    const spanStart = new Map<number, ComputedAnnotation>();
    const absorbed = new Set<number>();
    for (const a of annotations) {
      const [c1, c2] = [Math.min(...a.termCols), Math.max(...a.termCols)];
      if (cols.includes(c1) && cols.includes(c2)) {
        spanStart.set(c1, a);
        absorbed.add(c2);
      }
    }
    return (
      <div
        style={{
          display: "inline-grid",
          gridTemplateColumns: cols.length ? `repeat(${cols.length}, auto)` : "0px",
          columnGap: TEX_MED_SPACE,
          alignItems: "center",
        }}
      >
        {versions.flatMap((v, vi) =>
          cols.map((c, i) => (
            <div
              key={`p-${vi}-${c}`}
              aria-hidden="true"
              style={{ gridRow: 1, gridColumn: i + 1, height: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}
            >
              <Cell
                math={c === cols.find((cc) => !isBlankCell(v.cells[cc])) ? naturalSign(texSpacing(v.cells[c] ?? "")) : spaceJoiningSign(texSpacing(v.cells[c] ?? ""))}
                color="var(--ink)"
                align={align}
              />
            </div>
          ))
        )}
        {/* Height reservation: every version this line will ever take
            (e.g. "8x = -48" later becoming a stacked fraction), invisible
            and zero-width - so the line is already as tall as it will get,
            and its "=" never slides down when it changes in place. */}
        {!probeOnly &&
          slotId &&
          (slotVersions[slotId] ?? []).flatMap((v, vi) =>
            cols.map((c, i) => (
              <div
                key={`h-${vi}-${c}`}
                aria-hidden="true"
                style={{ gridRow: 1, gridColumn: i + 1, width: 0, overflow: "hidden", visibility: "hidden", paddingTop: padTop || undefined }}
              >
                <Cell math={topify(texSpacing(v.cells[c] ?? ""), slotId, c)} color="var(--ink)" align={align} />
              </div>
            ))
          )}
        {!probeOnly &&
          row &&
          cols.map((c, i) => {
            if (absorbed.has(c)) return null;
            const ann = spanStart.get(c);
            if (ann) {
              return (
                <div
                  key={c}
                  data-row-slot={dataSlot}
                  // Against the "=" (the diagram can be a little narrower
                  // than the plain cells it replaces).
                  style={{ gridRow: 1, gridColumn: `${i + 1} / span 2`, justifySelf: side === "left" ? "end" : "start" }}
                >
                  <DistributeDiagram
                    coefficient={texSpacing(ann.coefficient)}
                    term1={texSpacing(ann.term1)}
                    term2={texSpacing(ann.term2)}
                    arcsShown={ann.arcsShown}
                    prefix={ann.prefix && texSpacing(ann.prefix)}
                    prefixColor={ann.prefixColor}
                    suffix={ann.suffix && texSpacing(ann.suffix)}
                    suffixColor={ann.suffixColor}
                    parenColor={color}
                    forcePaddingTop={padTop}
                  />
                </div>
              );
            }
            if (isAnnotation) {
              // Lined up with the right edge of the term it sits under, and
              // allowed to extend past it (zero-width anchor, content
              // overflowing to the left) - so it never widens the column.
              return (
                <div
                  key={c}
                  data-row-slot={dataSlot}
                  style={{
                    gridRow: 1,
                    gridColumn: i + 1,
                    justifySelf: "end",
                    width: 0,
                    display: "flex",
                    justifyContent: "flex-end",
                    overflow: "visible",
                    paddingTop: padTop || undefined,
                  }}
                >
                  <Cell math={tightSign(texSpacing(row.cells[c] ?? ""))} color={color} align="right" />
                </div>
              );
            }
            const firstOnSide = cols.find((cc) => !isBlankCell(row.cells[cc]));
            const text = texSpacing(row.cells[c] ?? "");
            return (
              <div key={c} data-row-slot={dataSlot} style={{ gridRow: 1, gridColumn: i + 1, paddingTop: padTop || undefined }}>
                <Cell math={topify(c === firstOnSide ? naturalSign(text) : spaceJoiningSign(text), slotId, c)} color={color} align={align} />
              </div>
            );
          })}
      </div>
    );
  }

  const groups = Array.from(new Set(slotOrderAll.map((id) => groupOf[id])));

  return (
    <div style={{ overflowX: "auto", width: "100%", paddingTop: 14, paddingBottom: 4, paddingLeft: Math.max(crossLoops ? 18 : 0, overhang) || undefined }}>
      <div
        ref={gridRef}
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "auto auto auto",
          width: "fit-content",
          columnGap: TEX_THICK_SPACE,
          rowGap: 20,
          alignItems: "center",
          fontSize: 20,
        }}
      >
        {/* Probe: one invisible copy of each group's two sides, so the
            space on each side of "=" is the widest it will ever be. */}
        {groups.map((g) => (
          <div key={`pl-${g}`} aria-hidden="true" style={{ gridRow: 1, gridColumn: 1, height: 0, overflow: "hidden", visibility: "hidden" }}>
            <SideBlock group={g} side="left" probeOnly />
          </div>
        ))}
        {groups.map((g) => (
          <div key={`pr-${g}`} aria-hidden="true" style={{ gridRow: 1, gridColumn: 3, height: 0, overflow: "hidden", visibility: "hidden" }}>
            <SideBlock group={g} side="right" probeOnly />
          </div>
        ))}
        {/* Every line the problem will ever show is laid out from the
            first step - the ones not revealed yet are invisible but hold
            their exact space - so the card is sized for THIS problem
            (short for one-step, tall for multi-step) and never grows, and
            each new line appears in a spot that was already there. */}
        {slotOrderAll.map((slotId, i) => {
          const hidden = i >= rows.length;
          const row = hidden ? slotVersions[slotId][0] : rows[i];
          const gridRow = i + 1;
          const mb = row.marginBottom;
          const hide = hidden ? ({ visibility: "hidden" } as const) : undefined;
          if (row.caption !== undefined) {
            return (
              <div
                key={slotId}
                data-row-slot={hidden ? undefined : slotId}
                aria-hidden={hidden || undefined}
                style={{
                  ...hide,
                  gridRow,
                  gridColumn: "1 / span 3",
                  // Zero-width and centered, so a caption wider than the
                  // equation never stretches the layout (which would nudge
                  // every "=" sideways on the last step).
                  justifySelf: "center",
                  width: 0,
                  display: "flex",
                  justifyContent: "center",
                  overflow: "visible",
                  color: colorFor(row.highlight),
                  fontWeight: 700,
                  fontSize: 22,
                  whiteSpace: "nowrap",
                  padding: "4px 0",
                }}
              >
                <span>{row.caption}</span>
              </div>
            );
          }
          const group = groupOf[slotId] ?? slotId;
          const reserve = arcReserveSlots.has(slotId) || distributeAnnotations.some((a) => a.targetSlotId === slotId && a.arcsShown > 0);
          const eqSym = row.cells[e] ?? "";
          return [
            <div key={`${slotId}-l`} aria-hidden={hidden || undefined} style={{ ...hide, gridRow, gridColumn: 1, justifySelf: "end", marginBottom: mb, paddingRight: loopGap(slotId) }}>
              <SideBlock group={group} side="left" row={row} slotId={slotId} hidden={hidden} />
            </div>,
            <div
              key={`${slotId}-eq`}
              data-row-slot={hidden ? undefined : slotId}
              aria-hidden={hidden || undefined}
              style={{ ...hide, gridRow, gridColumn: 2, textAlign: "center", color: "var(--ink-soft)", whiteSpace: "nowrap", paddingTop: reserve ? 34 : undefined, marginBottom: mb }}
            >
              {eqSym
                ? topAligned.has(slotId)
                  ? (
                    // Same line height as the cells beside it, so the stacks
                    // line up exactly.
                    <div style={{ lineHeight: 1.8 }}>
                      {/* The "=" stays exactly where it was in "-3x = 21" -
                          level with the numbers - when the bars appear. */}
                      {renderStackTop(`0${"\u0005"}${eqSym}${"\u0005"}0`, "var(--ink-soft)")}
                    </div>
                  )
                  : <InlineMath math={eqSym} />
                : null}
            </div>,
            <div key={`${slotId}-r`} aria-hidden={hidden || undefined} style={{ ...hide, gridRow, gridColumn: 3, justifySelf: "start", marginBottom: mb, paddingLeft: loopGap(slotId) }}>
              <SideBlock group={group} side="right" row={row} slotId={slotId} hidden={hidden} />
            </div>,
          ];
        })}
        {crossLoops?.shown && <CrossLoops containerRef={gridRef} slotId={crossLoops.slotId} color="var(--blue)" />}
      </div>
    </div>
  );
}

export default function StepSolver({
  generate,
  skillName,
  finalButtonLabel = "Try a new problem →",
  celebrateOnComplete = true,
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

  // Proportions: the cross-multiply loops, once that step is answered.
  const crossLoopsIdx = instance.crossLoops ? instance.steps.findIndex((st) => st.stepId === instance.crossLoops!.afterStepId) : -1;
  const crossLoopsState = instance.crossLoops
    ? {
        slotId: instance.crossLoops.slotId,
        shown: crossLoopsIdx !== -1 && (stepIndex > crossLoopsIdx || (stepIndex === crossLoopsIdx && revealed)),
      }
    : undefined;

  // A step whose correct answer is a number line (inequalities): once it's
  // answered, that graph is drawn under the solution too.
  const graphStepIdx = instance.steps.findIndex((st) => st.choices.some((c) => c.isCorrect && c.text.startsWith(GRAPH_PREFIX)));
  const answerGraph =
    graphStepIdx === -1 ? null : instance.steps[graphStepIdx].choices.find((c) => c.isCorrect)!.text;
  const answerGraphShown = graphStepIdx !== -1 && (stepIndex > graphStepIdx || (stepIndex === graphStepIdx && revealed));


  // Systems of equations keep their own layout rules (paired rows, two
  // tracks) and render exactly as before; every other skill uses the
  // anchored layout (see AnchoredEquation).
  const isSystem = isPairedRow(instance.initialRow) || !!instance.trackLayout;
  const slotVersions: Record<string, GridRow[]> = {};
  const slotOrderAll: string[] = [];
  if (!isSystem) {
    const add = (id: string, row: GridRow | PairedGridRow) => {
      if (isPairedRow(row)) return;
      if (!(id in slotVersions)) {
        slotVersions[id] = [];
        slotOrderAll.push(id);
      }
      slotVersions[id].push(row);
    };
    add("__initial__", instance.initialRow);
    for (const step of instance.steps) for (const u of step.rowUpdates) add(u.slotId, u.row);
  }

  // Rows that will ever carry distribute arrows keep the arrows' headroom
  // from the moment they appear, so the arrows never push anything down.
  const arcReserveKeys = new Set<string>();
  for (const step of instance.steps) {
    const dv = step.distributeVisual;
    if (dv) arcReserveKeys.add(`${dv.targetSlotId ?? "__initial__"}|${dv.equation ?? ""}`);
  }

  let boldActiveSlotId: string | null = null;
  if (instance.boldAfter) {
    const afterIdx = instance.steps.findIndex((s) => s.stepId === instance.boldAfter!.afterStepId);
    const afterReached = afterIdx !== -1 && (stepIndex > afterIdx || (stepIndex === afterIdx && revealed));
    if (afterReached) boldActiveSlotId = instance.boldAfter.slotId;
  }

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
  ):
    | {
        coefficient: string;
        term1: string;
        term2: string;
        arcsShown: 0 | 1 | 2;
        termCols: [number, number];
        targetSlotId: string;
        prefix?: string;
        prefixColor?: string;
        suffix?: string;
        suffixColor?: string;
      }
    | undefined {
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
    // expressionRight (term cells at 2,3) - see eqColumnIndexFor. This
    // only holds when there are exactly 2 term columns; content.termCols
    // overrides it explicitly for a skill using more.
    const termCols: [number, number] = content.termCols ?? (eqColIdx === 2 ? [0, 1] : [2, 3]);
    return {
      coefficient: content.coefficient,
      term1: content.term1,
      term2: content.term2,
      arcsShown,
      termCols,
      targetSlotId: content.targetSlotId ?? "__initial__",
      prefix: content.prefix,
      prefixColor: content.prefixColor,
      suffix: content.suffix,
      suffixColor: content.suffixColor,
    };
  }

  // Collects EVERY distinct distributeVisual the student has reached so
  // far (by index <= stepIndex), not just the most recent one - this is
  // what lets both a left-side arc and a right-side arc stay
  // simultaneously visible once each has started, rather than the
  // second one replacing the first. Deduplicates by object identity,
  // since both of a side's own two distribute steps share the exact
  // same distributeVisual object. Falls back to the first one in the
  // whole array before any distribute step is reached at all, so the
  // diagram's empty state still shows from the very start, matching
  // every single-arc skill's existing behavior.
  function findAllActiveDistributeContents(steps: SolverStep[]): DistributeVisual[] {
    const seen = new Set<DistributeVisual>();
    for (let i = 0; i <= stepIndex && i < steps.length; i++) {
      const dv = steps[i].distributeVisual;
      if (dv && !dv.equation) seen.add(dv);
    }
    if (seen.size > 0) return [...seen];
    const first = steps.find((s) => s.distributeVisual && !s.distributeVisual.equation)?.distributeVisual;
    return first ? [first] : [];
  }

  const eq1DistributeContent = instance.steps.find((s) => s.distributeVisual?.equation === "eq1")?.distributeVisual;
  const eq2DistributeContent = instance.steps.find((s) => s.distributeVisual?.equation === "eq2")?.distributeVisual;
  const activeDistributeContents = findAllActiveDistributeContents(instance.steps);

  const eq1Annotation = eq1DistributeContent ? computeAnnotation(eq1DistributeContent, instance.steps, instance.eqColumnIndex) : undefined;
  const eq2Annotation = eq2DistributeContent ? computeAnnotation(eq2DistributeContent, instance.steps, instance.eqColumnIndex) : undefined;
  const distributeAnnotations = activeDistributeContents
    .map((content) => computeAnnotation(content, instance.steps, instance.eqColumnIndex))
    .filter((a): a is ComputedAnnotation => a !== undefined);

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
      {/* Below a certain width, the side-by-side math/MCQ layout leaves
          too little room for the math panel - a 4-column inequality row
          (constant, symbol, two expression terms) commonly needs ~190px,
          but halving the card's width down to a phone-sized viewport can
          leave well under half that, forcing the row into its own
          horizontal scroll container with no visible affordance that
          there's more content past the right edge - the rightmost term
          (often the answer itself) ends up sitting right at that
          silently-clipped edge. Stacking the two panels vertically below
          this breakpoint gives the math panel the full card width
          instead of half, which comfortably fits typical rows without
          needing to scroll at all. `!important` is required since the
          columns below are set via inline style, which media queries
          can't otherwise override. */}
      <style>{`
        @media (max-width: 640px) {
          .step-solver-panel {
            grid-template-columns: 1fr !important;
          }
          .step-solver-panel-left {
            border-right: none !important;
            border-bottom: 1px solid var(--line);
          }
        }
      `}</style>
      <div
        className="step-solver-panel"
        style={{
          display: "grid",
          gridTemplateColumns: instance.panelRatio ?? "1fr 1fr",
          border: "1px solid var(--line)",
          borderRadius: 16,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
      {/* LEFT: math */}
      <div
        className="step-solver-panel-left"
        style={{
          padding: "32px 28px",
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 320,
          minWidth: 0,
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
        {isSystem ? (
        <EquationGrid
          rows={visibleRows}
          boldSlotId={boldActiveSlotId}
          slotIds={slotOrder}
          eqColumnIndex={instance.eqColumnIndex}
          columnCount={instance.columnCount}
          distributeAnnotations={distributeAnnotations}
          eq1Annotation={eq1Annotation}
          eq2Annotation={eq2Annotation}
          termAlign={instance.termAlign}
          rowConnectors={instance.rowConnectors}
          trackLayout={instance.trackLayout}
          pairedLayout={instance.pairedLayout}
        />
        ) : (
          <AnchoredEquation
            rows={visibleRows as GridRow[]}
            slotIds={slotOrder}
            slotVersions={slotVersions}
            slotOrderAll={slotOrderAll}
            eqColumnIndex={instance.eqColumnIndex}
            distributeAnnotations={distributeAnnotations}
            arcReserveSlots={new Set([...arcReserveKeys].filter((k) => k.endsWith("|")).map((k) => k.slice(0, -1)))}
            crossLoops={crossLoopsState}
          />
        )}
        {/* The finished number line, under the work. Its room is held from
            the first step (invisible until the graph question is answered),
            so nothing moves and the card never grows when it appears. */}
        {!isSystem && answerGraph && (
          <div
            aria-hidden={!answerGraphShown}
            style={{ visibility: answerGraphShown ? "visible" : "hidden", maxWidth: 340, marginTop: 4 }}
          >
            <NumberLineGraph {...parseGraphChoice(answerGraph)} markerId="answer-graph" color="var(--green)" align="left" />
          </div>
        )}
        {isSystem ? (
          revealed &&
          currentStep && (
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
          )
        ) : (
          // Holds the room of the tallest explanation in the problem
          // (invisible copies stacked in one grid cell, at least two lines),
          // so an explanation appearing never makes the card taller - even
          // one with a stacked fraction in it.
          <div
            style={{
              marginTop: 6,
              minHeight: 40,
              display: "grid",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--green)",
              fontWeight: 600,
            }}
          >
            {instance.steps.map((st, si) => (
              <div key={`eprobe-${si}`} aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden", pointerEvents: "none" }}>
                ✓ <MixedText content={st.explanationOnCorrect} />
              </div>
            ))}
            {revealed && currentStep && (
              <div style={{ gridArea: "1 / 1" }}>
                ✓ <MixedText content={currentStep.explanationOnCorrect} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: MCQ */}
      <div
        style={{
          padding: instance.questionPanelPadding ?? "32px 28px",
          display: isSystem ? "flex" : "grid",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: isSystem ? undefined : "center",
          gap: 14,
          minHeight: 320,
          minWidth: 0,
        }}
      >
        {/* Non-system skills: an invisible copy of EVERY step's question,
            stacked in the same spot as the real one - so this panel is as
            tall as the tallest question the problem will ask (number-line
            choices are much taller than text ones) from the first step,
            and the card never grows mid-problem. */}
        {!isSystem &&
          instance.steps.map((st, si) => (
            <div
              key={`qprobe-${si}`}
              aria-hidden="true"
              style={{ gridArea: "1 / 1", visibility: "hidden", pointerEvents: "none", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}
            >
              <div style={{ height: 6 }} />
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, overflow: "visible", lineHeight: 1.8 }}>
                <MixedText content={st.prompt} />
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {st.choices.map((choice, ci) => {
                  const isGraph = choice.text.startsWith(GRAPH_PREFIX);
                  return (
                    <div
                      key={ci}
                      style={{
                        boxSizing: "border-box",
                        padding: isGraph ? "10px 14px" : "16px 14px 10px 14px",
                        border: "1.5px solid transparent",
                        fontSize: 14,
                        lineHeight: 1.6,
                        whiteSpace: "normal",
                        overflowX: isGraph ? "visible" : "hidden",
                      }}
                    >
                      {isGraph ? (
                        <NumberLineGraph {...parseGraphChoice(choice.text)} markerId={`probe-graph-${si}-${ci}`} />
                      ) : (
                        <MixedText content={choice.text} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, padding: "9px 20px", fontSize: 14, fontWeight: 700, border: "1.5px solid transparent" }}>
                Next step →
              </div>
            </div>
          ))}
        {currentStep && !isSystem && (
          <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, minWidth: 0 }}>
            {renderQuestion()}
          </div>
        )}
        {currentStep && isSystem && renderQuestion()}
      </div>
    </div>
    </>
  );

  function renderQuestion() {
    return (
          <>
            <div
              role="progressbar"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={instance!.steps.length}
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
                  width: `${(100 * (stepIndex + (revealed ? 1 : 0.15))) / instance!.steps.length}%`,
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
                      width: "100%",
                      boxSizing: "border-box",
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
                      whiteSpace: "normal",
                      overflowX: isGraph ? "visible" : "hidden",
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
    );
  }
}
