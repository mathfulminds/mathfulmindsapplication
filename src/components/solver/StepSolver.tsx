"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import katex from "katex";
import { InlineMath as KatexInlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import { autoMath } from "@/lib/display/autoMath";
import { signChoices } from "@/lib/display/signChoices";
import { applyNumberForms, firstSwitchableNumber, formsOfNumber, lastSwitchableTag } from "@/lib/display/numberForms";
import type { NumberForm } from "@/lib/display/numberForms";
import type { DistributeVisual, GridRow, PairedGridRow, SolverInstance, SolverStep, SideList } from "@/lib/skills/types";
import { moveTag } from "@/lib/skills/types";
import { termTag } from "@/lib/skills/combiningExpressions";
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

// Two endpoints (compound inequalities): "GRAPH:{lo}|{hi}|{between|outside}|
// {loInclusive}|{hiInclusive}". Same look as NumberLineGraph - shaded
// between the two circles for "and", or two rays pointing away from each
// other for "or". Whole-number endpoints only.
function CompoundNumberLineGraph({
  lo,
  hi,
  shape,
  loInc,
  hiInc,
  markerId,
  color = "var(--ink)",
  align = "center",
}: {
  lo: number;
  hi: number;
  shape: "between" | "outside";
  loInc: boolean;
  hiInc: boolean;
  markerId: string;
  color?: string;
  align?: "center" | "left";
}) {
  // A tick every `unit` so there are never more than about 13 of them.
  const span = hi - lo;
  const unit = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
  const first = Math.floor((lo - 2 * unit) / unit) * unit;
  const last = Math.ceil((hi + 2 * unit) / unit) * unit;
  const W = 320;
  const axisL = 8;
  const axisR = W - 8;
  const tickL = 34;
  const tickR = W - 34;
  const onTick = (v: number) => Number.isInteger(v / unit);
  const needAbove = !onTick(lo) || !onTick(hi);
  const y = needAbove ? 34 : 16;
  const H = y + 32;
  const xOf = (v: number) => tickL + ((v - first) / (last - first)) * (tickR - tickL);
  const ticks: number[] = [];
  for (let n = first; n <= last; n += unit) ticks.push(n);
  const xl = xOf(lo);
  const xh = xOf(hi);
  const word = (inc: boolean) => (inc ? "closed" : "open");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block", margin: align === "center" ? "0 auto" : 0, overflow: "visible" }}
      role="img"
      aria-label={`Number line: ${word(loInc)} circle at ${lo} and ${word(hiInc)} circle at ${hi}, shaded ${
        shape === "between" ? "between them" : "outward from both"
      }`}
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
        const isAnswer = n === lo || n === hi;
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
      {shape === "between" ? (
        <line x1={xl} y1={y} x2={xh} y2={y} stroke={color} strokeWidth={4} />
      ) : (
        <>
          <line x1={xl} y1={y} x2={axisL + 10} y2={y} stroke={color} strokeWidth={4} markerEnd={`url(#${markerId}-ray)`} />
          <line x1={xh} y1={y} x2={axisR - 10} y2={y} stroke={color} strokeWidth={4} markerEnd={`url(#${markerId}-ray)`} />
        </>
      )}
      <circle cx={xl} cy={y} r={6.5} fill={loInc ? color : "var(--card)"} stroke={color} strokeWidth={2.5} />
      <circle cx={xh} cy={y} r={6.5} fill={hiInc ? color : "var(--card)"} stroke={color} strokeWidth={2.5} />
      {!onTick(lo) && (
        <text x={xl} y={y - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
          {tickLabel(lo)}
        </text>
      )}
      {!onTick(hi) && (
        <text x={xh} y={y - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
          {tickLabel(hi)}
        </text>
      )}
    </svg>
  );
}

// Two answers as two rays on one number line, both right on the axis
// (overlapping where they do) - "GRAPH:{v1}|{v2}|rays|{inc1}|{inc2}|{L|R}{L|R}".
// For compound inequalities with no solution (the rays never overlap) or
// all real numbers (together they cover the line).
function RaysNumberLineGraph({
  rays,
  markerId,
  color = "var(--ink)",
  align = "center",
}: {
  rays: { value: number; dir: "left" | "right"; inc: boolean }[];
  markerId: string;
  color?: string;
  align?: "center" | "left";
}) {
  const lo = Math.min(...rays.map((r) => r.value));
  const hi = Math.max(...rays.map((r) => r.value));
  const span = Math.max(hi - lo, 2);
  const unit = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
  const first = Math.floor((lo - 2 * unit) / unit) * unit;
  const last = Math.ceil((hi + 2 * unit) / unit) * unit;
  const W = 320;
  const axisL = 8;
  const axisR = W - 8;
  const tickL = 34;
  const tickR = W - 34;
  const y = 22;
  const H = y + 34;
  const xOf = (v: number) => tickL + ((v - first) / (last - first)) * (tickR - tickL);
  const ticks: number[] = [];
  for (let n = first; n <= last; n += unit) ticks.push(n);
  const offsets = [0, 0]; // both rays right on the number line (they can overlap)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block", margin: align === "center" ? "0 auto" : 0, overflow: "visible" }}
      role="img"
      aria-label={`Number line with two rays: ${rays.map((r) => `${r.inc ? "closed" : "open"} circle at ${r.value} pointing ${r.dir}`).join(", and ")}`}
    >
      <defs>
        <marker id={`${markerId}-ax`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
          <path d="M0,0.5 L8,4 L0,7.5 Z" fill="var(--ink-soft)" />
        </marker>
        <marker id={`${markerId}-ray`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
        </marker>
      </defs>
      <line x1={axisL + 6} y1={y} x2={axisR - 6} y2={y} stroke="var(--ink-soft)" strokeWidth={1.5} markerStart={`url(#${markerId}-ax)`} markerEnd={`url(#${markerId}-ax)`} />
      {ticks.map((n) => {
        const tx = xOf(n);
        const isAnswer = rays.some((r) => r.value === n);
        return (
          <g key={n}>
            <line x1={tx} y1={y - 5} x2={tx} y2={y + 5} stroke="var(--ink-soft)" strokeWidth={1.25} />
            <text x={tx} y={y + 30} textAnchor="middle" fontSize={isAnswer ? 13 : 12} fontWeight={isAnswer ? 700 : 400} fill={isAnswer ? color : "var(--ink-soft)"}>
              {tickLabel(n)}
            </text>
          </g>
        );
      })}
      {rays.map((r, i) => {
        const ry = y + offsets[i];
        const x0 = xOf(r.value);
        const x1 = r.dir === "left" ? axisL + 10 : axisR - 10;
        return (
          <g key={i}>
            <line x1={x0} y1={ry} x2={x1} y2={ry} stroke={color} strokeWidth={3.5} markerEnd={`url(#${markerId}-ray)`} />
            <circle cx={x0} cy={ry} r={5.5} fill={r.inc ? color : "var(--card)"} stroke={color} strokeWidth={2.25} />
          </g>
        );
      })}
    </svg>
  );
}

// The list shown beside the work (factor pairs of c), one item per line,
// with the chosen one boxed in the answer color. Always laid out (just
// invisible until it's shown), so nothing moves when it appears.
// `full` is the fullest version the list will reach: its note, title and
// every item hold their room from the start, and only what `list` has so far
// is drawn - so the list grows in place and never moves the work.
function SideListPanel({ list, full, shown }: { list: SideList; full: SideList; shown: boolean }) {
  const hide = (visible: boolean) => (visible ? undefined : ("hidden" as const));
  return (
    <div aria-hidden={!shown} style={{ visibility: shown ? "visible" : "hidden", flex: "none", paddingTop: 14, fontSize: 20, color: "var(--ink)" }}>
      {full.note !== undefined && (
        <div style={{ whiteSpace: "nowrap", padding: "1px 8px", lineHeight: 1.7, marginBottom: 10, visibility: hide(list.note !== undefined) }}>
          <InlineMath math={list.note ?? full.note} />
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: "var(--ink-soft)", marginBottom: 6, whiteSpace: "nowrap", visibility: hide(list.items.length > 0) }}>{full.title}</div>
      {full.items.map((it, i) => {
        const marked = list.marked === i;
        return (
          <div
            key={i}
            style={{
              visibility: hide(i < list.items.length),
              whiteSpace: "nowrap",
              padding: "1px 8px",
              margin: "2px 0",
              lineHeight: 1.7,
              color: marked ? "var(--green)" : "var(--ink)",
              // an outline doesn't take up space, so marking one never moves the list
              outline: marked ? "1.5px solid var(--ink)" : "none",
              borderRadius: 4,
              width: "fit-content",
            }}
          >
            <InlineMath math={it} />
          </div>
        );
      })}
    </div>
  );
}

// Any GRAPH: choice - one endpoint (3 fields), two (5 fields), or two rays (6).
function GraphFromText({ text, markerId, color, align }: { text: string; markerId: string; color?: string; align?: "center" | "left" }) {
  const f = text.slice(GRAPH_PREFIX.length).split("|");
  if (f.length === 6 && f[2] === "rays") {
    const ray = (v: string, inc: string, d: string) => ({ value: Number(v), inc: inc === "1", dir: d === "L" ? ("left" as const) : ("right" as const) });
    return <RaysNumberLineGraph rays={[ray(f[0], f[3], f[5][0]), ray(f[1], f[4], f[5][1])]} markerId={markerId} color={color} align={align} />;
  }
  if (f.length === 5) {
    return (
      <CompoundNumberLineGraph
        lo={Number(f[0])}
        hi={Number(f[1])}
        shape={f[2] === "outside" ? "outside" : "between"}
        loInc={f[3] === "1"}
        hiInc={f[4] === "1"}
        markerId={markerId}
        color={color}
        align={align}
      />
    );
  }
  return <NumberLineGraph {...parseGraphChoice(text)} markerId={markerId} color={color} align={align} />;
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
  // "coefficient \u0006 variable", or "before \u0006 variable \u0006 after"
  // when the canceled part sits on both sides of the variable (formulas:
  // "mx" over "x" solving for m, "lwh" over "lh" solving for w).
  const pieces = numeratorRaw.split(COEF_VAR_SEPARATOR);
  const coefficient = pieces[0];
  const variable = pieces[1] ?? "";
  const afterPart = pieces[2] ?? "";
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
        {coefficient ? (
          <XMark size="large">
            <InlineMath math={coefficient} />
          </XMark>
        ) : null}
        {variable.length > 0 ? (
          <span style={{ marginLeft: coefficient ? 4 : 0, marginRight: afterPart ? 4 : 0 }}>
            <InlineMath math={variable} />
          </span>
        ) : null}
        {afterPart ? (
          <XMark size="large">
            <InlineMath math={afterPart} />
          </XMark>
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

function crossedFraction(num: string, den: string, color: string, crossed = true): ReactNode {
  // (crossed = false draws the same fraction without the red marks)
  const part = (tex: string) => (crossed ? <XMark size="large"><InlineMath math={tex} /></XMark> : <span style={{ display: "inline-block" }}><InlineMath math={tex} /></span>);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", margin: "0 2px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", padding: "0 0.2em 0.1em", lineHeight: 1.15 }}>
        {part(num)}
      </span>
      <span style={{ borderTop: `0.06em solid ${color}`, alignSelf: "stretch" }} />
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", padding: "0.1em 0.2em 0", lineHeight: 1.15 }}>
        {part(den)}
      </span>
    </span>
  );
}


function renderMarkedReciprocal(content: string, color: string): ReactNode {
  // (a 7th part "plain" draws the same thing before anything is crossed
  // out, so nothing moves when the crosses appear)
  const [side, rn, rd, cn, cd, v, plain] = content.split(COEF_VAR_SEPARATOR);
  const crossed = plain !== "plain";
  // a negative fraction: the minus sign sits to the left of the fraction,
  // not on top
  const signed = (num: string, den: string) => {
    const neg = (num.startsWith("-") ? 1 : 0) + (den.startsWith("-") ? 1 : 0);
    return (
      <>
        {neg % 2 === 1 && <InlineMath math="-" />}
        {crossedFraction(num.replace(/^-/, ""), den.replace(/^-/, ""), color, crossed)}
      </>
    );
  };
  const recip = (
    <>
      (
      {signed(rn, rd)}
      )
    </>
  );
  const term = (
    <>
      (
      {signed(cn, cd)}
      )
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


// A term whose number in front is crossed out, the letter left alone:
// "3/4 x" with the 3/4 crossed (it was divided by 3/4). The term itself is
// drawn exactly as it was before (the same single piece of math), and the
// cross is laid over an invisible copy of just the number - so nothing
// moves when the cross appears.
// Format: "MARKEDCOEF:{number}\u0006{rest}".
const MARKEDCOEF_PREFIX = "MARKEDCOEF:";
function renderMarkedCoef(content: string): ReactNode {
  const [coef, rest = ""] = content.split(COEF_VAR_SEPARATOR);
  // (a fraction is tall and narrow: its cross reaches a little further out
  // on each side, so it's as easy to see as the one on the note under it)
  const reach = coef.includes("\\dfrac") ? "0.18em" : "0em";
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <InlineMath math={`${coef}${rest}`} />
      <span aria-hidden="true" style={{ position: "absolute", left: `-${reach}`, top: 0, pointerEvents: "none", whiteSpace: "nowrap" }}>
        <XMark size="large">
          <span style={{ visibility: "hidden", display: "inline-block", padding: `0 ${reach}` }}>
            <InlineMath math={coef} />
          </span>
        </XMark>
      </span>
    </span>
  );
}

// A piece of math drawn exactly as it was, with a red X laid over some of
// the numbers in it - each X centered on that number's own digits. The
// numbers are found in the drawn math and measured (the middle of the ink of
// the digits, not of the box around them), so the math itself is untouched
// and nothing moves when the X appears.
//   "outside": the number written beside a fraction - the 3 in "(3) x/3"
//   "bottom":  the number under the fraction's bar - the 3 in "x/3"
//   "topBold": the bold number on top of the fraction - the 6 in "6(3x + 1)(2x + 3) / 6"
type CrossTarget = "outside" | "bottom" | "topBold";
function crossTargets(root: HTMLElement, which: CrossTarget): HTMLElement[] {
  const digits = Array.from(root.querySelectorAll<HTMLElement>(".katex-html .mord")).filter((el) => el.childElementCount === 0 && /^\d+$/.test(el.textContent ?? ""));
  const inFraction = (el: HTMLElement) => !!el.closest(".mfrac");
  if (which === "outside") return digits.filter((el) => !inFraction(el));
  const inside = digits.filter(inFraction);
  const lowest = Math.max(...inside.map((el) => el.getBoundingClientRect().top));
  if (which === "topBold") return inside.filter((el) => el.getBoundingClientRect().top <= lowest - 2 && el.classList.contains("mathbf"));
  return inside.filter((el) => el.getBoundingClientRect().top > lowest - 2);
}
// the vertical middle of the digits themselves in a run of text
let inkCanvas: CanvasRenderingContext2D | null | undefined;
function inkCenterY(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  if (inkCanvas === undefined) inkCanvas = document.createElement("canvas").getContext("2d");
  const cs = getComputedStyle(el);
  if (!inkCanvas) return r.top + r.height / 2;
  inkCanvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = inkCanvas.measureText(el.textContent ?? "");
  const fontUp = m.fontBoundingBoxAscent;
  const fontDown = m.fontBoundingBoxDescent;
  if (!Number.isFinite(fontUp) || !Number.isFinite(fontDown) || !Number.isFinite(m.actualBoundingBoxAscent)) return r.top + r.height / 2;
  const baseline = r.top + (r.height - (fontUp + fontDown)) / 2 + fontUp;
  return baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
}
function CrossedMath({ math, cross }: { math: string; cross: CrossTarget[] }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [marks, setMarks] = useState<{ x: number; y: number; w: number }[]>([]);
  const key = `${math}|${cross.join(",")}`;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      if (!box.width) return;
      const round = (v: number) => Math.round(v * 2) / 2;
      const next = cross
        .map((which) => crossTargets(root, which))
        .filter((els) => els.length > 0)
        .map((els) => {
          const rects = els.map((el) => el.getBoundingClientRect());
          const left = Math.min(...rects.map((b) => b.left));
          const right = Math.max(...rects.map((b) => b.right));
          return { x: round((left + right) / 2 - box.left), y: round(inkCenterY(els[0]) - box.top), w: round(right - left) };
        });
      setMarks((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    // (the math font may finish loading after the first measure)
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <InlineMath math={math} />
      {marks.map((m, i) => (
        // same X as XMark: two bars reaching 4px past the number on each side
        <span key={i} aria-hidden="true" style={{ position: "absolute", left: m.x - m.w / 2 - 4, top: m.y, width: m.w + 8, height: 0, pointerEvents: "none" }}>
          <span style={{ position: "absolute", left: 0, right: 0, top: -1.25, height: 2.5, background: "var(--coral)", transform: "rotate(-20deg)" }} />
          <span style={{ position: "absolute", left: 0, right: 0, top: -1.25, height: 2.5, background: "var(--coral)", transform: "rotate(20deg)" }} />
        </span>
      ))}
    </span>
  );
}

// A fraction whose bottom number is crossed out: "x/3" with the 3 crossed
// (it was multiplied by 3).
// Format: "MARKEDDEN:{sign}\u0006{top}\u0006{bottom}".
const MARKEDDEN_PREFIX = "MARKEDDEN:";
function renderMarkedDen(content: string): ReactNode {
  const [sign = "", top = "", den = ""] = content.split(COEF_VAR_SEPARATOR);
  return <CrossedMath math={`${sign}\\dfrac{${top}}{${den}}`} cross={["bottom"]} />;
}

// A fraction with the bold number on top and the number under the bar both
// crossed out: "6(3x + 1)(2x + 3) / 6" (the two 6s divide to 1).
// Format: "CROSSFRAC:" + the math.
const CROSSFRAC_PREFIX = "CROSSFRAC:";

// "x/3" multiplied by 3, written "(3) x/3" (or "x/3 (3)" on the right side
// of the "="), with both 3s crossed out.
// Format: "MARKEDTIMES:{L|R}\u0006{number}\u0006{top}\u0006{bottom}".
const MARKEDTIMES_PREFIX = "MARKEDTIMES:";
function renderMarkedTimes(content: string): ReactNode {
  const [side = "L", outer = "", top = "", den = ""] = content.split(COEF_VAR_SEPARATOR);
  const frac = `\\dfrac{${top}}{${den}}`;
  return <CrossedMath math={side === "L" ? `(${outer})${frac}` : `${frac}(${outer})`} cross={["outside", "bottom"]} />;
}

// Clearing fractions: one side of the line the LCD is written on. The LCD
// and its parentheses hold their room from the start (unseen until the LCD
// is found), so the line is the same size before and after and nothing moves.
//   several terms: the side is wrapped, "6(x/3 + 1/2)", and as each product
//     is found an arrow is drawn from the 6 to that term, in the headroom
//     kept above the line (the distributive property);
//   one term: nothing is distributed, so the LCD is written beside the term
//     at the outer end of the side - "(6) x/3" on the left of the "=",
//     "5(6)" on the right - with no arrow.
// Format: "LCDWRAP:" + JSON { lcd, side: "L"|"R", single, on: the LCD is
// showing, arrows: how many terms (from the left) have an arrow, tall: a
// term is a fraction (tall parentheses), terms: [{ s: sign, b: the term, v:
// written yet }] }.
const LCDWRAP_PREFIX = "LCDWRAP:";
function LcdWrap({ payload, color }: { payload: string; color: string }) {
  const { lcd, side, single, on, arrows, tall, terms } = JSON.parse(payload) as {
    lcd: string;
    side: "L" | "R";
    single: boolean;
    on: boolean;
    arrows: number;
    tall: boolean;
    terms: { s: string; b: string; v: boolean }[];
  };
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const lcdRef = useRef<HTMLSpanElement | null>(null);
  const termRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // where each arrow starts and ends, measured from the drawn pieces
  const [geo, setGeo] = useState<{ from: number; to: number[] } | null>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || single) return;
    const measure = () => {
      const b = box.getBoundingClientRect();
      const l = lcdRef.current?.getBoundingClientRect();
      if (!b.width || !l) return;
      const next = {
        from: Math.round(l.left + l.width / 2 - b.left),
        to: terms.map((_t, i) => {
          const r = termRefs.current[i]?.getBoundingClientRect();
          return r ? Math.round(r.left + r.width / 2 - b.left) : 0;
        }),
      };
      setGeo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);
  const hide = on ? undefined : ({ visibility: "hidden" } as const);
  const termPieces = terms.map((t, i) => (
    <span key={i} style={{ display: "inline-flex", alignItems: "baseline", visibility: t.v ? undefined : "hidden" }}>
      {t.s && <InlineMath math={i === 0 ? t.s : `{}${t.s}{}`} />}
      <span ref={(el) => { termRefs.current[i] = el; }}>
        <InlineMath math={t.b} />
      </span>
    </span>
  ));
  if (single) {
    // "(6)" beside the one term, at the outer end of its side. A negative
    // term on the left gets parentheses of its own: "(6)(-x/3)".
    const beside = (
      <span style={hide}>
        <InlineMath math={`(${lcd})`} />
      </span>
    );
    const wrapTerm = side === "L" && terms[0]?.s === "-";
    const paren = (tex: string) => (
      <span style={hide}>
        <InlineMath math={tall ? `\\bigg${tex}` : tex} />
      </span>
    );
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", color }}>
        {side === "L" && beside}
        {wrapTerm && paren("(")}
        {termPieces}
        {wrapTerm && paren(")")}
        {side === "R" && beside}
      </span>
    );
  }
  const startY = -7;
  return (
    <span ref={boxRef} style={{ position: "relative", display: "inline-flex", alignItems: "baseline", color }}>
      {on && geo && arrows > 0 && (
        <svg aria-hidden="true" width="1" height="1" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          {geo.to.slice(0, arrows).map((to, i) => {
            // each arrow arcs a little higher than the one before it; its
            // head is drawn along the arc's direction where it lands
            const rise = 16 + 13 * i;
            const mid = (geo.from + to) / 2;
            const angle = (Math.atan2(rise, to - mid) * 180) / Math.PI;
            return (
              <g key={i}>
                <path d={`M ${geo.from} ${startY} Q ${mid} ${startY - rise} ${to} ${startY}`} stroke="var(--ink-soft)" strokeWidth={1.3} fill="none" />
                <polygon points="0,0 -6.5,-2.8 -6.5,2.8" fill="var(--ink-soft)" transform={`translate(${to} ${startY}) rotate(${angle})`} />
              </g>
            );
          })}
        </svg>
      )}
      <span ref={lcdRef} style={hide}>
        <InlineMath math={lcd} />
      </span>
      <span style={hide}>
        <InlineMath math={tall ? "\\bigg(" : "("} />
      </span>
      {termPieces}
      <span style={hide}>
        <InlineMath math={tall ? "\\bigg)" : ")"} />
      </span>
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
// Space kept under the numbers when a note line tucks up (see tuckSlots):
// about what a plain line leaves under its numbers.
const TUCK_KEEP = 6;
// How far a notes line tucks up under a line with a fraction in front of x.
const FRACTION_NOTE_TUCK = 10;
// ...and when an answer on that line sits under the fractions above.
const TUCK_KEEP_ANSWER = 14;
// Room between an answer and the box drawn around it.
const BOX_PAD_X = 6;
const BOX_PAD_Y = 3;

function renderStackTop(content: string, color: string): ReactNode {
  const [bar, num, den] = content.split(STACK_SEPARATOR);
  const shown = bar === "1";
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle" }}>
      <span data-stack-num="" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "1.2em", paddingBottom: "0.1em", lineHeight: 1.15 }}>
        {num.startsWith(MARKEDTERM_PREFIX) ? (
          // a crossed-out number on a line that's divided in place elsewhere
          <XMark>
            <InlineMath math={num.slice(MARKEDTERM_PREFIX.length)} />
          </XMark>
        ) : (
          <InlineMath math={num} />
        )}
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
// A zero-width rule as tall and deep as "0", "f" and "%" (KaTeX: 0.75em
// above the baseline, 0.194em below). A \vphantom would do the same, but its
// invisible text sticks out past the numbers, and Safari counts that toward
// the fraction's width - long bars and extra gaps.
const FRACTION_STRUT = "\\rule[-0.1944em]{0pt}{0.9444em}";

function strutFractions(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    if (tex.startsWith("\\dfrac{", i)) {
      // The strut goes AFTER the numbers: in front, it would turn a leading
      // minus ("-6") into a subtraction sign with space around it.
      out += "\\dfrac{";
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
      out += strutFractions(num) + FRACTION_STRUT + "}";
      if (tex[i] === "{") {
        let dd = 1;
        let den = "";
        i++;
        while (i < tex.length && dd > 0) {
          const ch = tex[i];
          if (ch === "{") dd++;
          else if (ch === "}") dd--;
          if (dd > 0) den += ch;
          i++;
        }
        out += "{" + strutFractions(den) + FRACTION_STRUT + "}";
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
  // Math with a number the student can click to switch its form (see
  // numberForms.ts) carries \htmlData tags, which KaTeX only accepts when
  // told to trust them - so that math is rendered here directly.
  if (math.includes("\\htmlData")) return <TaggedMath math={strutFractions(math)} />;
  return <KatexInlineMath math={strutFractions(math)} />;
}
function TaggedMath({ math }: { math: string }) {
  const html = useMemo(
    () => katex.renderToString(math, { throwOnError: false, strict: false, trust: (context) => context.command === "\\htmlData" }),
    [math]
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// An expression whose like terms get shapes (combining like terms): each
// term is its own piece, spaced by measuring it - just enough room between
// terms for the shapes around them (with a few pixels between shapes). The
// whole expression stays on one line, scaled down to fit when it's long.
// Shape sizes here match the ones AnchoredEquation draws (GridRow.marks).
// Shape sizes for a term w wide on a line whose glyphs are h tall - shared
// by the spacing (TermRun) and the drawing (AnchoredEquation), so they agree.
// Triangles stand tall and narrow (the term sits in the wide bottom part);
// diamonds are just big enough to clear the term's corners.
function triangleShape(w: number, h: number) {
  const above = 1.4 * h; // apex above the top of the glyphs
  const below = 2; // base under the bottom of the glyphs
  // (wide enough that its sides clear the term's top corners by 2px)
  const half = ((w / 2 + 2) * (above + h + below)) / above;
  return { half, above, below };
}
function diamondShape(w: number, h: number) {
  return { W: (w / 2) * 1.45 + 4, H: (h / 2 + 3) * 1.6 };
}

const TERMRUN_PREFIX = "TERMRUN:";
type TermRunLayout = { m: number[]; trail: number; scale: number };
// (the work's lines are rebuilt on every step, so a finished layout is
// remembered here - a rebuilt line starts already in place)
const termRunCache = new Map<string, TermRunLayout>();
function TermRun({ payload }: { payload: string }) {
  const { t, s } = JSON.parse(payload) as { t: string[]; s: string[] };
  const ref = useRef<HTMLSpanElement | null>(null);
  const [lay, setLay] = useState<TermRunLayout | null>(() => termRunCache.get(payload) ?? null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cur = lay?.scale ?? 1;
    const kids = Array.from(el.children) as HTMLElement[];
    // each term's own glyphs (the tagged spans), unscaled
    const boxes = kids.map((k) => {
      const bs = Array.from(k.querySelectorAll<HTMLElement>("span"))
        .filter((x) => x.style.color)
        .map((x) => x.getBoundingClientRect())
        .filter((b) => b.width > 0);
      if (!bs.length) return null;
      return { l: Math.min(...bs.map((b) => b.left)), r: Math.max(...bs.map((b) => b.right)), t: Math.min(...bs.map((b) => b.top)), b: Math.max(...bs.map((b) => b.bottom)) };
    });
    if (boxes.some((b) => !b)) return;
    const bx = boxes as { l: number; r: number; t: number; b: number }[];
    const H = (Math.max(...bx.map((b) => b.b)) - Math.min(...bx.map((b) => b.t))) / cur;
    const P = 3;
    const hb = H / 2 + P;
    const ext = bx.map((b, i) => {
      const w = (b.r - b.l) / cur;
      switch (s[i]) {
        case "circle": {
          const ry = hb * 1.05;
          return Math.max((w / 2) * 1.16 + 2, ry * 0.95) - w / 2;
        }
        case "box":
          return P + 2;
        case "triangle":
          return triangleShape(w, H).half - w / 2;
        case "diamond":
          return diamondShape(w, H).W - w / 2;
        case "line":
          return 1;
        default:
          return 0;
      }
    });
    // (glyph edges sit a little inside each piece; measured, not assumed)
    const inset = bx.map((b, i) => ({ l: (b.l - kids[i].getBoundingClientRect().left) / cur, r: (kids[i].getBoundingClientRect().right - b.r) / cur }));
    const GAP = 6;
    // the same small gap between every pair of shapes (outline to outline)
    const m = ext.map((e, i) => (i === 0 ? e + 2 - inset[0].l : ext[i - 1] + e + GAP - inset[i - 1].r - inset[i].l));
    const trail = ext[ext.length - 1] + 2 - inset[inset.length - 1].r;
    const natural = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width / cur, 0) + m.reduce((a, b) => a + b, 0) + trail;
    // fit the space the work has (the card's work side, less its padding)
    const panel = el.closest(".step-solver-panel-left") as HTMLElement | null;
    const avail = panel ? panel.clientWidth - 56 - 40 : Infinity;
    const scale = Math.min(1, Math.max(0.45, avail / natural));
    const next = { m: m.map((v) => Math.round(v * 10) / 10), trail: Math.round(trail * 10) / 10, scale: Math.round(scale * 100) / 100 };
    // (only a real change: measuring at a smaller size rounds a little
    // differently, and chasing that would never settle)
    const differs =
      !lay ||
      Math.abs(next.scale - lay.scale) > 0.015 ||
      Math.abs(next.trail - lay.trail) > 1 ||
      next.m.some((v, i) => Math.abs(v - (lay.m[i] ?? 0)) > 1);
    if (differs) {
      termRunCache.set(payload, next);
      setLay(next);
    }
  });
  // once the terms move into place, the marks drawn over them are measured
  // again (AnchoredEquation listens for this)
  const announced = useRef<TermRunLayout | null>(lay);
  useLayoutEffect(() => {
    if (lay && lay !== announced.current) {
      announced.current = lay;
      window.dispatchEvent(new Event("termrun-layout"));
    }
  }, [lay]);
  const sc = lay?.scale ?? 1;
  return (
    <span ref={ref} style={{ display: "inline-flex", alignItems: "baseline", fontSize: `${sc}em`, paddingRight: (lay?.trail ?? 0) * sc }}>
      {t.map((tex, i) => (
        <span key={i} style={{ marginLeft: (lay?.m[i] ?? 8) * sc }}>
          <InlineMath math={tex} />
        </span>
      ))}
    </span>
  );
}

function Cell({ math, color, align = "center" }: { math: string; color: string; align?: "center" | "right" | "left" }) {
  if (math.startsWith(TERMRUN_PREFIX)) {
    return (
      <div style={{ textAlign: align, color, overflow: "visible", lineHeight: 1.8, whiteSpace: "nowrap" }}>
        <TermRun payload={math.slice(TERMRUN_PREFIX.length)} />
      </div>
    );
  }
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
      ) : math_.startsWith(LCDWRAP_PREFIX) ? (
        <LcdWrap payload={math_.slice(LCDWRAP_PREFIX.length)} color={color} />
      ) : math_.startsWith(MARKEDCOEF_PREFIX) ? (
        renderMarkedCoef(math_.slice(MARKEDCOEF_PREFIX.length))
      ) : math_.startsWith(MARKEDDEN_PREFIX) ? (
        renderMarkedDen(math_.slice(MARKEDDEN_PREFIX.length))
      ) : math_.startsWith(CROSSFRAC_PREFIX) ? (
        <CrossedMath math={math_.slice(CROSSFRAC_PREFIX.length)} cross={["topBold", "bottom"]} />
      ) : math_.startsWith(MARKEDTIMES_PREFIX) ? (
        renderMarkedTimes(math_.slice(MARKEDTIMES_PREFIX.length))
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
          // A fraction inside a sentence (a question, an answer choice, a
          // message) is always drawn full size, with room between its
          // numbers and a bar that's easy to see (.mixed-math in
          // globals.css) - never the small, cramped in-line kind.
          <span key={i} className="mixed-math">
            <InlineMath math={part.slice(1, -1).replace(/\\[td]?frac(?![a-zA-Z])/g, "\\dfrac")} />
          </span>
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

type DiagramGroup = { lead?: string; coefficient: string; term1: string; term2: string; arcsShown: 0 | 1 | 2 };

function DistributeDiagram({
  coefficient,
  term1,
  term2,
  arcsShown,
  chain,
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
  // more sets of parentheses after the first, on the same line
  chain?: DiagramGroup[];
  prefix?: string;
  prefixColor?: string;
  suffix?: string;
  suffixColor?: string;
  parenColor?: string;
  // Overrides this diagram's own arcsShown-based padding - needed when
  // TWO diagrams share the same row (a left-side and a right-side one,
  // both simultaneously visible): the whole row needs the same padding as
  // whichever diagram (or neither) currently has the most arcs shown.
  forcePaddingTop?: number;
}) {
  const groups: DiagramGroup[] = [{ coefficient, term1, term2, arcsShown }, ...(chain ?? [])];
  const anyShown = groups.some((g) => g.arcsShown > 0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // three refs per group: the number in front and the two terms inside
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [measured, setMeasured] = useState<{ coefX: number; term1X: number; term2X: number; y: number }[] | null>(null);
  const key = JSON.stringify(groups.map((g) => [g.lead, g.coefficient, g.term1, g.term2, g.arcsShown]));

  // Measures the real rendered position of each token (each is its own
  // KaTeX element). Re-measured when the padding changes (arcs appearing
  // move the text down).
  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const c = box.getBoundingClientRect();
    const out: { coefX: number; term1X: number; term2X: number; y: number }[] = [];
    for (let i = 0; i < groups.length; i++) {
      const [a, b, d] = [refs.current[i * 3], refs.current[i * 3 + 1], refs.current[i * 3 + 2]];
      if (!a || !b || !d) {
        setMeasured(null);
        return;
      }
      const [ra, rb, rd] = [a.getBoundingClientRect(), b.getBoundingClientRect(), d.getBoundingClientRect()];
      out.push({ coefX: ra.left + ra.width / 2 - c.left, term1X: rb.left + rb.width / 2 - c.left, term2X: rd.left + rd.width / 2 - c.left, y: ra.top - c.top });
    }
    if (JSON.stringify(out) !== JSON.stringify(measured)) setMeasured(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, forcePaddingTop]);

  const arcGap = 10;
  const arcs = (m: { coefX: number; term1X: number; term2X: number; y: number }) => {
    const dist1 = Math.abs(m.term1X - m.coefX);
    const height1 = 8 + dist1 * 0.22;
    const mid1 = (m.coefX + m.term1X) / 2;
    const a1 = `M ${m.coefX} ${m.y - arcGap} Q ${mid1} ${m.y - arcGap - height1} ${m.term1X} ${m.y - arcGap}`;
    const dist2 = Math.abs(m.term2X - m.coefX);
    // the longer arc always clears the shorter one's peak
    const height2 = Math.max(height1 + 16, 8 + dist2 * 0.22);
    const mid2 = (m.coefX + m.term2X) / 2;
    const a2 = `M ${m.coefX} ${m.y - arcGap} Q ${mid2} ${m.y - arcGap - height2} ${m.term2X} ${m.y - arcGap}`;
    return [a1, a2];
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-block",
        paddingTop: forcePaddingTop !== undefined ? forcePaddingTop : anyShown ? 34 : 0,
      }}
    >
      {measured && (
        <svg
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
        >
          <defs>
            <marker id="distribute-diagram-head" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--ink-soft)" />
            </marker>
          </defs>
          {groups.map((g, i) => {
            const m = measured[i];
            if (!m) return null;
            const [a1, a2] = arcs(m);
            return (
              <g key={i}>
                {g.arcsShown >= 1 && <path d={a1} stroke="var(--ink-soft)" strokeWidth={1.3} fill="none" markerEnd="url(#distribute-diagram-head)" />}
                {g.arcsShown >= 2 && <path d={a2} stroke="var(--ink-soft)" strokeWidth={1.3} fill="none" markerEnd="url(#distribute-diagram-head)" />}
              </g>
            );
          })}
        </svg>
      )}
      <div style={{ display: "flex", alignItems: "baseline", fontSize: 20 }}>
        {prefix && (
          <span style={{ marginRight: ownsRightSpace(prefix) ? 0 : 4, color: prefixColor }}>
            <InlineMath math={prefix} />
          </span>
        )}
        {groups.map((g, i) => (
          <Fragment key={i}>
            {g.lead && (
              <span style={{ marginLeft: ownsLeftSpace(g.lead) ? 0 : 4, marginRight: ownsRightSpace(g.lead) ? 0 : 4, color: prefixColor }}>
                <InlineMath math={g.lead} />
              </span>
            )}
            <span ref={(el) => { refs.current[i * 3] = el; }}>
              <InlineMath math={g.coefficient} />
            </span>
            <span style={{ color: parenColor }}>
              <InlineMath math="(" />
            </span>
            <span ref={(el) => { refs.current[i * 3 + 1] = el; }}>
              <InlineMath math={g.term1} />
            </span>
            <span ref={(el) => { refs.current[i * 3 + 2] = el; }} style={{ marginLeft: 4 }}>
              <InlineMath math={g.term2} />
            </span>
            <span style={{ color: parenColor }}>
              <InlineMath math=")" />
            </span>
          </Fragment>
        ))}
        {suffix && (
          <span style={{ marginLeft: ownsLeftSpace(suffix) ? 0 : 4, color: suffixColor }}>
            <InlineMath math={suffix} />
          </span>
        )}
      </div>
    </div>
  );
}

// A piece written with "{}" at its edge ("{}+ 4x", "5 - {}") carries its
// own TeX spacing around the sign there, so it gets no extra margin.
function ownsLeftSpace(tex: string): boolean {
  return tex.startsWith("{}");
}
function ownsRightSpace(tex: string): boolean {
  return tex.endsWith("{}") || tex.endsWith("\\:");
}

type ComputedAnnotation = {
  coefficient: string;
  term1: string;
  term2: string;
  arcsShown: 0 | 1 | 2; // the most arcs any of its groups shows (sets the padding)
  ownArcs?: 0 | 1 | 2; // the first group's own, when there's a chain
  chain?: DiagramGroup[];
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

// "x = -6": a variable worked out to a number (an answer in a system).
function isSolvedValue(cells: readonly string[]): boolean {
  const parts = cells.filter((c) => !isBlankCell(c)).map((c) => c.replace(/\\hspace\{[^}]*\}/g, "").replace(/\s+/g, ""));
  return parts.length === 3 && /^[a-z]$/.test(parts[0]) && parts[1] === "=" && /^[+-]?(\d+(\.\d+)?|\\[dt]?frac\{\d+\}\{\d+\})$/.test(parts[2]);
}

// A box around each answer line in the systems grid (cells tagged with
// data-box-key), measured from the page and drawn on top, taking no space.
function AnswerBoxes({ containerRef }: { containerRef: { current: HTMLDivElement | null } }) {
  const [boxes, setBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const g = box.getBoundingClientRect();
    const byKey = new Map<string, DOMRect[]>();
    box.querySelectorAll<HTMLElement>("[data-box-key]").forEach((el) => {
      const key = el.getAttribute("data-box-key")!;
      const rects = Array.from(el.querySelectorAll<HTMLElement>(".katex-html .mord, .katex-html .mbin, .katex-html .mrel, .katex-html .mopen, .katex-html .mclose, .katex-html .mpunct, .katex-html .frac-line"))
        .filter((k) => !k.closest(".pstrut, .strut"))
        .map((k) => k.getBoundingClientRect())
        .filter((b) => b.width > 0);
      byKey.set(key, [...(byKey.get(key) ?? []), ...rects]);
    });
    const next = [...byKey.values()].filter((r) => r.length).map((rects) => {
      const left = Math.min(...rects.map((b) => b.left)) - g.left - BOX_PAD_X;
      const right = Math.max(...rects.map((b) => b.right)) - g.left + BOX_PAD_X;
      const top = Math.min(...rects.map((b) => b.top)) - g.top - BOX_PAD_Y;
      const bottom = Math.max(...rects.map((b) => b.bottom)) - g.top + BOX_PAD_Y;
      return { left: Math.round(left), top: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
    });
    if (JSON.stringify(next) !== JSON.stringify(boxes)) setBoxes(next);
  });
  return (
    <>
      {boxes.map((b, i) => (
        <div key={`ab-${i}`} aria-hidden="true" style={{ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, border: "1.5px solid var(--ink)", borderRadius: 4, pointerEvents: "none" }} />
      ))}
    </>
  );
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
        padTop: number = 0,
        boxKey?: string
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
                data-box-key={boxKey}
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
            <div key={`${rowKey}-${colIndex}`} data-row-slot={slotIdForRow} data-box-key={boxKey} style={style}>
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
        reserveArcSpace: boolean = false,
        boxKey?: string
      ) {
        // A row that will EVER carry distribute arrows keeps their 34px of
        // headroom from the moment it appears, so the arrows showing up
        // later never push this row (and everything below it) down.
        if (annotations.length === 0) {
          return renderCells(cells, rowKey, color, slotIdForRow, marginBottom, reserveArcSpace ? 34 : 0, boxKey);
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
                  arcsShown={annotation.ownArcs ?? annotation.arcsShown}
                  chain={annotation.chain}
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
          ...renderCellsOrArrow(row.eq1, `${rowIndex}-eq1`, colorFor(row.eq1Highlight), eq1Ann ? [eq1Ann] : [], slotId, -8, !!arcReserveKeys?.has(`${slotId}|eq1`), row.eq1Highlight === "success" ? `${slotId}-eq1` : undefined),
          ...renderCellsOrArrow(row.eq2, `${rowIndex}-eq2`, colorFor(row.eq2Highlight), eq2Ann ? [eq2Ann] : [], slotId, undefined, !!arcReserveKeys?.has(`${slotId}|eq2`), row.eq2Highlight === "success" ? `${slotId}-eq2` : undefined),
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
      return renderCellsOrArrow(row.cells, `${rowIndex}`, color, matchingAnnotations, slotId, row.marginBottom, !!arcReserveKeys?.has(`${slotId}|`), row.highlight === "success" || isSolvedValue(row.cells) ? `${slotId}` : undefined);
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
          <AnswerBoxes containerRef={outerRef} />
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
        <AnswerBoxes containerRef={outerRef} />
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

// A relation sign or "or"/"and" that isn't in the anchor column
// (compound inequalities write these as \mkern1mu< or \;\text{or}\;).
const CONNECTOR_RE = /^\\(mkern1mu|;)/;

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
  alignColumns,
}: {
  alignColumns?: boolean;
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
      grid.querySelectorAll<HTMLElement>(".katex, [data-caption]").forEach((el) => {
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
  const isConnector = (c: string | undefined) => !!c && CONNECTOR_RE.test(c);
  const isDivision = (c: string) => /^\\dfrac\{[^{}]*\}\{[^{}]*\}$/.test(c) || c.startsWith("MARKEDFRACTION:");
  const hasFraction = (c: string) => /\\dfrac|\\frac|MARKEDFRACTION:|MARKEDPARENFRACTION:|STACKEDFRACTION:|MARKEDRECIP:/.test(c);
  // Each column (other than the anchor) is written out (or blank), then
  // divided - and stays divided; columns that never divide stay plain. At
  // least one column has to be divided in place for this to matter.
  function compoundTopAligned(versions: GridRow[]): boolean {
    let inPlace = false;
    const width = versions[0]?.cells.length ?? 0;
    for (let i = 0; i < width; i++) {
      if (i === e) continue;
      const vals = versions.map((r) => r.cells[i] ?? "");
      const fi = vals.findIndex(isDivision);
      const before = fi === -1 ? vals : vals.slice(0, fi);
      // a column that's never divided can have a number crossed out (the
      // other inequality's constant)
      if (fi === -1) {
        if (vals.some((c) => /^[A-Z]+:/.test(c) && !c.startsWith("MARKEDTERM:"))) return false;
        continue;
      }
      if (before.some((c) => /^[A-Z]+:/.test(c))) return false;
      if (!vals.slice(fi).every(isDivision)) return false;
      if (before.some((c) => !isBlankCell(c))) inPlace = true;
    }
    return inPlace;
  }

  const topAligned = new Set(
    slotOrderAll.filter((id) => {
      const versions = (slotVersions[id] ?? []).filter((r) => r.caption === undefined);
      // The line is written out (possibly a piece at a time) with no
      // fractions, then divided: the first fractioned version divides
      // every term of the last plain one, and nothing else.
      // Compound inequalities divide one inequality at a time (the left one,
      // later the right one), so their lines are checked column by column.
      if (versions.some((r) => r.cells.some(isConnector))) return compoundTopAligned(versions);
      const firstFrac = versions.findIndex((r) => r.cells.some(hasFraction));
      if (firstFrac < 1) return false;
      const flat = versions[firstFrac - 1];
      if (versions.slice(0, firstFrac).some((r) => r.cells.some((c) => /^[A-Z]+:/.test(c)))) return false;
      // Compound inequalities ("2x < 4 or 3x > 12"): the second symbol, the
      // "or", and a part that needs no dividing stay as they are.
      const compoundLine = flat.cells.some(isConnector);
      // Every later version is exactly that division (plain, or with the
      // canceled numbers crossed out).
      return versions
        .slice(firstFrac)
        .every((d) =>
          d.cells.every(
            (c, i) =>
              i === e ||
              (isBlankCell(flat.cells[i])
                ? isBlankCell(c)
                : isDivision(c) || (compoundLine && c === flat.cells[i]))
          )
        );
    })
  );

  // Denominator each column of a top-aligned line will get, so the flat
  // version can hold that space (invisibly) from the start.
  const futureDen: Record<string, Record<number, string>> = {};
  for (const id of topAligned) {
    futureDen[id] = {};
    // each column's first division (all at once for most lines; one
    // inequality at a time for compound inequalities)
    for (const r of slotVersions[id] ?? []) {
      r.cells.forEach((c, i) => {
        if (i in futureDen[id]) return;
        const m = c.match(/^\\dfrac\{(.*)\}\{(.*)\}$/);
        if (m) futureDen[id][i] = m[2];
        else if (c.startsWith("MARKEDFRACTION:")) futureDen[id][i] = c.slice(c.indexOf("\u0005") + 1);
      });
    }
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

  // A note line ("+4   +4") under a line that keeps room for denominators
  // in OTHER columns (compound inequalities: the other inequality is
  // divided in place on that line) tucks up under its own numbers, instead
  // of sitting below that empty room. Measured once from the layout, the
  // same on every step - so nothing moves.
  const tuckSlots = slotOrderAll.filter((id, i) => {
    if (i === 0 || !isAnnotationSlot(id)) return false;
    const above = slotOrderAll[i - 1];
    if (!topAligned.has(above)) return false;
    const divCols = new Set(Object.keys(futureDen[above] ?? {}).map(Number));
    if (divCols.size === 0) return false;
    if ((slotVersions[id] ?? []).some((r) => r.tuckPastFractions)) return true;
    return !(slotVersions[id] ?? []).some((r) => r.cells.some((c, ci) => divCols.has(ci) && !isBlankCell(c)));
  });
  const [tuck, setTuck] = useState<Record<string, number>>({});
  const [lift, setLift] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next: Record<string, number> = {};
    for (const id of tuckSlots) {
      const above = slotOrderAll[slotOrderAll.indexOf(id) - 1];
      const lines = Array.from(grid.querySelectorAll<HTMLElement>(`[data-line="${CSS.escape(above)}"]`));
      const nums = lines.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>("[data-stack-num]")));
      if (!lines.length || !nums.length) continue;
      const bottom = Math.max(...lines.map((el) => el.getBoundingClientRect().bottom));
      const numBottom = Math.max(...nums.map((el) => el.getBoundingClientRect().bottom));
      // (an answer under the fractions keeps enough room to clear them)
      const keep = (slotVersions[id] ?? []).some((r) => r.tuckPastFractions) ? TUCK_KEEP_ANSWER : TUCK_KEEP;
      const room = bottom - numBottom - keep;
      if (room > 0) next[id] = Math.round(room);
    }
    // A notes line ("+2   +2") under a line with a fraction in front of x
    // sits as close under that line as it would under a plain line: the tall
    // fraction would otherwise push it further down. (A fixed amount, the
    // same on every step, so nothing moves.)
    slotOrderAll.forEach((id, i) => {
      if (i === 0 || tuckSlots.includes(id) || !isAnnotationSlot(id)) return;
      if (fracCoefSlot(slotOrderAll[i - 1])) next[id] = FRACTION_NOTE_TUCK;
    });
    const same = Object.keys(next).length === Object.keys(tuck).length && Object.entries(next).every(([k, v]) => tuck[k] === v);
    if (!same) setTuck(next);
    // A notes line that can't tuck up as a whole (an answer on it has to
    // stay under the fractions above) lifts just its marked notes.
    const nextLift: Record<string, number> = {};
    slotOrderAll.forEach((id, i) => {
      if (i === 0 || tuckSlots.includes(id) || !isAnnotationSlot(id)) return;
      if (!(slotVersions[id] ?? []).some((r) => r.liftCols?.length)) return;
      const above = slotOrderAll[i - 1];
      if (!topAligned.has(above)) return;
      const lines = Array.from(grid.querySelectorAll<HTMLElement>(`[data-line="${CSS.escape(above)}"]`));
      const nums = lines.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>("[data-stack-num]")));
      if (!lines.length || !nums.length) return;
      const bottom = Math.max(...lines.map((el) => el.getBoundingClientRect().bottom));
      const numBottom = Math.max(...nums.map((el) => el.getBoundingClientRect().bottom));
      const room = bottom - numBottom - TUCK_KEEP;
      if (room > 0) nextLift[id] = Math.round(room);
    });
    const sameLift = Object.keys(nextLift).length === Object.keys(lift).length && Object.entries(nextLift).every(([k, v]) => lift[k] === v);
    if (!sameLift) setLift(nextLift);
  });

  // Answers drawn in a box (GridRow.boxCols): a black outline around the
  // answer's cells, measured from the page and drawn on top - it never
  // takes up space, so nothing around it moves.
  // Every answer is boxed: a final (success) line with no boxes of its own
  // gets one box around the whole line; a caption answer ("No Solution")
  // gets a box around its words.
  const boxColsOf = (r: GridRow): number[][] | undefined =>
    r.boxCols?.length ? r.boxCols : r.highlight === "success" && r.caption === undefined && r.cells.length ? [r.cells.map((_c, i) => i)] : undefined;
  const boxesCaption = (r: GridRow) => r.highlight === "success" && r.caption !== undefined && r.caption !== "";
  const hasBoxes = slotOrderAll.some((id) => (slotVersions[id] ?? []).some((r) => boxColsOf(r) || boxesCaption(r)));
  const [boxes, setBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const next: { left: number; top: number; width: number; height: number }[] = [];
    rows.forEach((r, i) => {
      const slot = slotOrderAll[i];
      if (!slot) return;
      if (boxesCaption(r)) {
        const cap = grid.querySelector<HTMLElement>(`[data-row-slot="${CSS.escape(slot)}"] [data-caption]`);
        const b = cap?.getBoundingClientRect();
        if (b && b.width > 0) {
          next.push({ left: Math.round(b.left - g.left - BOX_PAD_X - 2), top: Math.round(b.top - g.top - BOX_PAD_Y), width: Math.round(b.width + 2 * BOX_PAD_X + 4), height: Math.round(b.height + 2 * BOX_PAD_Y) });
        }
        return;
      }
      const groups = boxColsOf(r);
      if (!groups) return;
      const cellEls = Array.from(grid.querySelectorAll<HTMLElement>(`[data-row-slot="${CSS.escape(slot)}"][data-col]`));
      for (const group of groups) {
        const rects = cellEls
          .filter((el) => group.includes(Number(el.getAttribute("data-col"))))
          // every visible piece of the math - letters, numbers, signs and
          // fraction bars - so a fraction is measured top to bottom the same
          // way in every browser (Safari sizes KaTeX's containers differently)
          .flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>(".katex-html .mord, .katex-html .mbin, .katex-html .mrel, .katex-html .mopen, .katex-html .mclose, .katex-html .mpunct, .katex-html .frac-line")))
          .filter((el) => !el.closest(".pstrut, .strut"))
          .filter((el) => getComputedStyle(el).visibility !== "hidden")
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0);
        if (!rects.length) continue;
        const left = Math.min(...rects.map((b) => b.left)) - g.left - BOX_PAD_X;
        const right = Math.max(...rects.map((b) => b.right)) - g.left + BOX_PAD_X;
        const top = Math.min(...rects.map((b) => b.top)) - g.top - BOX_PAD_Y;
        const bottom = Math.max(...rects.map((b) => b.bottom)) - g.top + BOX_PAD_Y;
        next.push({ left: Math.round(left), top: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) });
      }
    });
    if (JSON.stringify(next) !== JSON.stringify(boxes)) setBoxes(next);
  });

  // Arrows carrying terms across the "=" (GridRow.moveArrows): each one
  // arcs from the term it moves, over the "=", to the end of the other side,
  // with its label ("-6x") above it. Each arrow arcs higher than the one
  // before, high enough that it clears the earlier arrow's label. Measured
  // from the page; the line keeps the room for all of them from the start,
  // so nothing moves when one appears.
  type MoveArrowGeo = { d: string; head: string; lx: number; ly: number; shown: boolean };
  const [moveGeo, setMoveGeo] = useState<{ reserve: Record<string, number>; arrows: Record<string, MoveArrowGeo[]> }>({ reserve: {}, arrows: {} });
  const moveSpecs = slotOrderAll
    .map((slot, i) => ({ slot, i, spec: (slotVersions[slot] ?? []).find((v) => v.moveArrows)?.moveArrows }))
    .filter((m) => m.spec) as { slot: string; i: number; spec: NonNullable<GridRow["moveArrows"]> }[];
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !moveSpecs.length) return;
    const g = grid.getBoundingClientRect();
    const reserve: Record<string, number> = {};
    const arrows: Record<string, MoveArrowGeo[]> = {};
    const GLYPHS = ".katex-html .mord, .katex-html .mbin, .katex-html .mrel, .katex-html .mopen, .katex-html .mclose, .katex-html .mpunct";
    const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    for (const { slot, i, spec } of moveSpecs) {
      // (just the two sides - the blank cells hold invisible placeholders)
      const cells = Array.from(grid.querySelectorAll<HTMLElement>(`[data-row-slot="${CSS.escape(slot)}"][data-col]`)).filter((el) =>
        spec.sideCols.includes(Number(el.getAttribute("data-col")))
      );
      if (!cells.length) continue;
      const row = rows[i] as GridRow | undefined;
      const count = row?.moveArrows?.count ?? 0;
      const glyphs = cells.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>(GLYPHS))).filter((el) => !el.closest(".pstrut, .strut"));
      const rects = glyphs.map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
      if (!rects.length) continue;
      const glyphTop = Math.min(...rects.map((b) => b.top));
      // the room the line already has above its glyphs, without the padding
      // held for the arrows
      const cellTop = Math.min(...cells.map((el) => el.getBoundingClientRect().top));
      const curPad = moveGeo.reserve[slot] ?? 0;
      const naturalGap = glyphTop - (cellTop + curPad);
      const tagged = (k: number) => {
        const want = rgb(moveTag(k));
        const els = cells.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>("span"))).filter((el) => el.style.color === want);
        const bs = els.map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
        return bs.length ? { left: Math.min(...bs.map((b) => b.left)), right: Math.max(...bs.map((b) => b.right)) } : null;
      };
      // where the arrows land: just past the end of the other side
      const landCell = cells.find((el) => Number(el.getAttribute("data-col")) === (spec.to === "left" ? spec.sideCols[0] : spec.sideCols[1]));
      const landRects = landCell
        ? Array.from(landCell.querySelectorAll<HTMLElement>(GLYPHS)).filter((el) => !el.closest(".pstrut, .strut")).map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0)
        : [];
      if (!landRects.length) continue;
      const lx = Math.max(...landRects.map((b) => b.right)) - g.left + (spec.to === "right" ? 6 : 2);
      const y0 = glyphTop - g.top - 3;
      // each arrow is half an ellipse from the term down to the landing spot;
      // the term nearest the landing spot gets the lowest arrow, and each
      // one farther out arcs over the ones inside it
      const out: MoveArrowGeo[] = [];
      let prevLabel: { l: number; r: number; top: number } | null = null;
      let prevH = 0;
      let highest = y0;
      const toRight = spec.to === "right";
      const srcs = spec.labels.map((_lab, k) => {
        const src = tagged(k);
        return src ? { k, sx: (src.left + src.right) / 2 - g.left } : null;
      }).filter((v): v is { k: number; sx: number } => !!v);
      srcs.sort((m, n) => Math.abs(m.sx - lx) - Math.abs(n.sx - lx));
      for (const { k, sx } of srcs) {
        const cx = (sx + lx) / 2;
        const rx = Math.abs(sx - lx) / 2;
        // A rounded arch: straight up from the term, flat across the top,
        // straight down to the landing spot - so an arrow passing over a
        // smaller one only has to be just taller than that one's label.
        const R = Math.min(12, rx * 0.6);
        let h = Math.max(14, prevH + 10);
        if (prevLabel) h = Math.max(h, y0 - prevLabel.top + 4);
        prevH = h;
        const labEl = grid.querySelector<HTMLElement>(`[data-move-label="${CSS.escape(slot)}-${k}"]`);
        const lw = labEl?.offsetWidth ?? 30;
        const lh = labEl?.offsetHeight ?? 20;
        // centered on the top of its arrow (nudged off the landing spot only
        // if the arrow is too narrow - the taller arrows come down there)
        const midX = toRight ? Math.min(cx, lx - 13 - lw / 2) : Math.max(cx, lx + 13 + lw / 2);
        const labTop = y0 - h - 2 - lh;
        prevLabel = { l: midX - lw / 2, r: midX + lw / 2, top: labTop };
        highest = Math.min(highest, labTop, y0 - h);
        out[k] = {
          d: (() => {
            const dir = lx < sx ? -1 : 1; // which way the arrow travels
            const top = y0 - h;
            const r = Math.min(R, h * 0.7);
            const f = (n: number) => n.toFixed(1);
            return `M ${f(sx)} ${f(y0)} L ${f(sx)} ${f(top + r)} Q ${f(sx)} ${f(top)} ${f(sx + dir * r)} ${f(top)} L ${f(lx - dir * r)} ${f(top)} Q ${f(lx)} ${f(top)} ${f(lx)} ${f(top + r)} L ${f(lx)} ${f(y0 - 6)}`;
          })(),
          head: `${(lx - 4.5).toFixed(1)},${(y0 - 7).toFixed(1)} ${(lx + 4.5).toFixed(1)},${(y0 - 7).toFixed(1)} ${lx.toFixed(1)},${(y0 + 1).toFixed(1)}`,
          lx: Math.round(midX - lw / 2),
          ly: Math.round(labTop),
          shown: k < count,
        };
      }
      arrows[slot] = out;
      // room above the line for the highest arrow or label
      const need = y0 + 3 - highest + 4;
      reserve[slot] = Math.max(0, Math.ceil(need - naturalGap));
    }
    if (JSON.stringify({ reserve, arrows }) !== JSON.stringify(moveGeo)) setMoveGeo({ reserve, arrows });
  });

  // Like terms marked in an expression (GridRow.marks): a circle, box,
  // triangle or diamond around each term - sign included - or colored
  // underlines (one per power). Measured from the page; the line keeps the
  // room above and below for every mark it will ever get, so nothing moves.
  type MarkGeo = { d: string; color: string; shown: boolean };
  // (an expression's terms settle into place after this component lays out:
  // measure again when they do)
  const [, setRelayout] = useState(0);
  useEffect(() => {
    const h = () => setRelayout((n) => n + 1);
    window.addEventListener("termrun-layout", h);
    return () => window.removeEventListener("termrun-layout", h);
  }, []);
  const [markGeo, setMarkGeo] = useState<{ top: Record<string, number>; bottom: Record<string, number>; marks: MarkGeo[] }>({ top: {}, bottom: {}, marks: [] });
  const markSpecs = slotOrderAll
    .map((slot, i) => ({ slot, i, spec: (slotVersions[slot] ?? []).find((v) => v.marks)?.marks }))
    .filter((m) => m.spec) as { slot: string; i: number; spec: NonNullable<GridRow["marks"]> }[];
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !markSpecs.length) return;
    const g = grid.getBoundingClientRect();
    const top: Record<string, number> = {};
    const bottom: Record<string, number> = {};
    const marks: MarkGeo[] = [];
    const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    const f = (n: number) => n.toFixed(1);
    for (const { slot, i, spec } of markSpecs) {
      const cells = Array.from(grid.querySelectorAll<HTMLElement>(`[data-row-slot="${CSS.escape(slot)}"][data-col]`));
      if (!cells.length) continue;
      const shownSet = new Set(((rows[i] as GridRow | undefined)?.marks?.shown) ?? []);
      const spans = cells.flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>("span")));
      const rects = spec.kinds.map((_k, t) => {
        const want = rgb(termTag(t));
        const bs = spans.filter((el) => el.style.color === want).map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
        return bs.length
          ? { l: Math.min(...bs.map((b) => b.left)) - g.left, r: Math.max(...bs.map((b) => b.right)) - g.left, t: Math.min(...bs.map((b) => b.top)) - g.top, b: Math.max(...bs.map((b) => b.bottom)) - g.top }
          : null;
      });
      const found = rects.filter((r): r is NonNullable<typeof r> => !!r);
      if (!found.length) continue;
      // every shape is the same height: the line's own top and bottom
      const lineTop = Math.min(...found.map((r) => r.t));
      const lineBottom = Math.max(...found.map((r) => r.b));
      const cy = (lineTop + lineBottom) / 2;
      const P = 3;
      const hb = (lineBottom - lineTop) / 2 + P;
      let hi = lineTop;
      let lo = lineBottom;
      rects.forEach((r, t) => {
        const kind = spec.kinds[t];
        if (!r || kind < 0) return;
        const color = spec.colors[kind];
        const cx = (r.l + r.r) / 2;
        const ha = (r.r - r.l) / 2 + P;
        let d = "";
        if (spec.mode === "lines") {
          // (in this mode, "degrees" is each kind's number of lines)
          const n = spec.degrees[kind];
          for (let j = 0; j < n; j++) {
            const y = lineBottom + 5 + j * 3.5;
            d += `M ${f(r.l)} ${f(y)} H ${f(r.r)} `;
            lo = Math.max(lo, y + 2);
          }
          if (!d) return;
        } else if (kind === 0) {
          const ry = hb * 1.05;
          // (a short term like "5" still gets a round circle, not a sliver)
          const rx = Math.max((r.r - r.l) / 2 * 1.16 + 2, ry * 0.95);
          d = `M ${f(cx - rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
          hi = Math.min(hi, cy - ry);
          lo = Math.max(lo, cy + ry);
        } else if (kind === 1) {
          const x0 = cx - ha - 2, x1 = cx + ha + 2, y0 = cy - hb, y1 = cy + hb, rr = 4;
          d = `M ${f(x0 + rr)} ${f(y0)} H ${f(x1 - rr)} Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + rr)} V ${f(y1 - rr)} Q ${f(x1)} ${f(y1)} ${f(x1 - rr)} ${f(y1)} H ${f(x0 + rr)} Q ${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - rr)} V ${f(y0 + rr)} Q ${f(x0)} ${f(y0)} ${f(x0 + rr)} ${f(y0)} Z`;
          hi = Math.min(hi, y0);
          lo = Math.max(lo, y1);
        } else if (kind === 2) {
          // apex up; the term fits inside with room to spare
          const tri = triangleShape(r.r - r.l, lineBottom - lineTop);
          const baseY = lineBottom + tri.below, apexY = lineTop - tri.above, half = tri.half;
          d = `M ${f(cx)} ${f(apexY)} L ${f(cx + half)} ${f(baseY)} L ${f(cx - half)} ${f(baseY)} Z`;
          hi = Math.min(hi, apexY);
          lo = Math.max(lo, baseY);
        } else {
          const { W, H } = diamondShape(r.r - r.l, lineBottom - lineTop);
          d = `M ${f(cx)} ${f(cy - H)} L ${f(cx + W)} ${f(cy)} L ${f(cx)} ${f(cy + H)} L ${f(cx - W)} ${f(cy)} Z`;
          hi = Math.min(hi, cy - H);
          lo = Math.max(lo, cy + H);
        }
        marks.push({ d, color, shown: shownSet.has(t) });
      });
      const cellTop = Math.min(...cells.map((el) => el.getBoundingClientRect().top)) - g.top;
      const cellBottom = Math.max(...cells.map((el) => el.getBoundingClientRect().bottom)) - g.top;
      const naturalTop = lineTop - (cellTop + (markGeo.top[slot] ?? 0));
      const naturalBottom = cellBottom - (markGeo.bottom[slot] ?? 0) - lineBottom;
      top[slot] = Math.max(0, Math.ceil(lineTop - hi + 4 - naturalTop));
      bottom[slot] = Math.max(0, Math.ceil(lo - lineBottom + 4 - naturalBottom));
    }
    const next = { top, bottom, marks };
    if (JSON.stringify(next) !== JSON.stringify(markGeo)) setMarkGeo(next);
  });

  // Group = a line plus the annotation lines directly under it; they share
  // one set of column positions.
  const groupOf: Record<string, string> = {};
  const groupSlots: Record<string, string[]> = {};
  let anchor = slotOrderAll[0];
  for (const id of slotOrderAll) {
    // alignColumns: every line shares one set of columns (compound
    // inequalities - each inequality sign stays in the same spot).
    if (!isAnnotationSlot(id) && !alignColumns) anchor = id;
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

  // A term that starts its own expression shows its natural sign ("-2x",
  // not "- 2x"): the first term on its side, or the first term after a
  // second inequality sign or "and"/"or" (compound inequalities).
  function startsTerm(cells: readonly string[], c: number, cols: number[]): boolean {
    const prev = cols.filter((cc) => cc < c && !isBlankCell(cells[cc])).pop();
    return prev === undefined || isConnector(cells[prev]);
  }

  // A line with a fraction in front of a letter ("1/2 x + 3 = 8") lines its
  // pieces up on their baseline, so the bottom of the x sits level with the
  // bottom of the numbers beside it (centering them leaves the x a little
  // high in some browsers, since the fraction is tall).
  function fracCoefSlot(slotId: string): boolean {
    return (slotVersions[slotId] ?? []).some((v) => v.cells.some((c) => /\\dfrac\{[^{}]*\}\{[^{}]*\}\}?[a-zA-Z]/.test(c ?? "") && !/^[A-Z]+:/.test(c ?? "")));
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
    // Lined-up columns (compound inequalities): on the right side, a term
    // in the column just before an inequality sign hugs that sign.
    const connectorCol = (col: number | undefined) => col !== undefined && versions.some((v) => isConnector(v.cells[col]));
    const alignFor = (c: number, width = 1): "left" | "right" => {
      if (!alignColumns) return align;
      const at = cols.indexOf(c);
      if (connectorCol(cols[at + width])) return "right"; // a sign right after it
      if (connectorCol(cols[at - 1])) return "left"; // a sign right before it
      return align;
    };
    // a cell that also takes up the next column (see GridRow.spanNext)
    const spans = (r: GridRow, c: number) => !!r.spanNext?.includes(c) && cols[cols.indexOf(c) + 1] === c + 1;
    const color = row ? colorFor(row.highlight) : "var(--ink)";
    const annotations = row && slotId ? distributeAnnotations.filter((a) => a.targetSlotId === slotId) : [];
    const reserve = !!slotId && arcReserveSlots.has(slotId);
    const padTop = Math.max(reserve || annotations.some((a) => a.arcsShown > 0) ? 34 : 0, (slotId && moveGeo.reserve[slotId]) || 0, (slotId && markGeo.top[slotId]) || 0);
    const padBottom = (slotId && markGeo.bottom[slotId]) || 0;
    const spanStart = new Map<number, ComputedAnnotation>();
    const absorbed = new Set<number>();
    for (const a of annotations) {
      const [c1, c2] = [Math.min(...a.termCols), Math.max(...a.termCols)];
      // (the second column may be empty on every version of this line - a
      // whole side written in one cell - and then takes no room at all)
      if (cols.includes(c1)) {
        spanStart.set(c1, a);
        if (cols.includes(c2)) absorbed.add(c2);
      }
    }
    return (
      <div
        style={{
          display: "inline-grid",
          gridTemplateColumns: cols.length ? `repeat(${cols.length}, auto)` : "0px",
          columnGap: TEX_MED_SPACE,
          alignItems: row?.baseline || (slotId && fracCoefSlot(slotId)) ? "baseline" : "center",
        }}
      >
        {versions.flatMap((v, vi) =>
          cols.map((c, i) => (i > 0 && spans(v, cols[i - 1]) ? null : v.noWidthCols?.includes(c) ? (
            // drawn without widening its column: a zero-width copy, placed
            // the way the real one will be - so the room it reaches past the
            // left edge is held from the first step
            <div
              key={`p-${vi}-${c}`}
              aria-hidden="true"
              style={{
                gridRow: 1,
                gridColumn: spans(v, c) ? `${i + 1} / span 2` : i + 1,
                height: 0,
                width: 0,
                // clipped (it's invisible anyway): a clipped box never sets
                // the line's baseline, but its position is still measured
                overflow: "hidden",
                visibility: "hidden",
                whiteSpace: "nowrap",
                ...(alignFor(c, spans(v, c) ? 2 : 1) === "right" ? { justifySelf: "end", display: "flex", justifyContent: "flex-end" } : { justifySelf: "start" }),
              }}
            >
              <Cell math={startsTerm(v.cells, c, cols) ? naturalSign(texSpacing(v.cells[c] ?? "")) : spaceJoiningSign(texSpacing(v.cells[c] ?? ""))} color="var(--ink)" align={align} />
            </div>
          ) : (
            <div
              key={`p-${vi}-${c}`}
              aria-hidden="true"
              // A cell that spans into the next column is measured in its own
              // column only: all of its width goes to the term's column, so
              // the next column (a "+ 1") stays tight and a lone "x" above
              // or below still sits right against it.
              style={{ gridRow: 1, gridColumn: i + 1, height: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}
            >
              <Cell
                math={startsTerm(v.cells, c, cols) ? naturalSign(texSpacing(v.cells[c] ?? "")) : spaceJoiningSign(texSpacing(v.cells[c] ?? ""))}
                color="var(--ink)"
                align={align}
              />
            </div>
          )))
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
                style={{ gridRow: 1, gridColumn: i + 1, width: 0, overflow: "hidden", visibility: "hidden", paddingTop: padTop || undefined, paddingBottom: padBottom || undefined }}
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
                  style={{ gridRow: 1, gridColumn: absorbed.has(cols[i + 1]) ? `${i + 1} / span 2` : i + 1, justifySelf: side === "left" ? "end" : "start" }}
                >
                  <DistributeDiagram
                    coefficient={texSpacing(ann.coefficient)}
                    term1={texSpacing(ann.term1)}
                    term2={texSpacing(ann.term2)}
                    arcsShown={ann.ownArcs ?? ann.arcsShown}
                    chain={ann.chain}
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
              // In lined-up columns where the term sits at the left of its
              // column (a number just after a sign), the note starts where
              // that number starts instead.
              const fromLeft = alignColumns && alignFor(c) === "left";
              const liftOf = (col: number) => (slotId && lift[slotId] && row.liftCols?.includes(col) ? `translateY(${-lift[slotId]}px)` : undefined);
              // ...and ends where that number ends: an invisible copy of the
              // number above sets the width, and the note hangs from its
              // right edge.
              const above = slotId ? slotOrderAll[slotOrderAll.indexOf(slotId) - 1] : undefined;
              const aboveCell = above ? (slotVersions[above] ?? []).map((v) => v.cells[c] ?? "").filter((t) => !isBlankCell(t)).pop() : undefined;
              // (an answer written on a note line - "x < 4" - starts right
              // after its sign instead)
              const afterSign = i > 0 && isConnector(row.cells[cols[i - 1]]);
              const ref = fromLeft && !afterSign && aboveCell && !/^[A-Z]+:/.test(aboveCell) ? aboveCell : undefined;
              if (ref) {
                return (
                  <div key={c} data-row-slot={dataSlot} data-col={c} style={{ gridRow: 1, gridColumn: i + 1, justifySelf: "start", width: 0, overflow: "visible", paddingTop: padTop || undefined, paddingBottom: padBottom || undefined, transform: liftOf(c) }}>
                    {/* zero-width, so the number above (which may itself be drawn
                        without widening its column) never widens this line */}
                    <div style={{ position: "relative", width: "fit-content" }}>
                      <div aria-hidden="true" style={{ height: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}>
                        <Cell math={texSpacing(ref)} color="var(--ink)" align="left" />
                      </div>
                      <div aria-hidden="true" style={{ width: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}>
                        <Cell math={tightSign(texSpacing(row.cells[c] ?? ""))} color={row.successCols?.includes(c) ? "var(--green)" : color} align="right" />
                      </div>
                      <div style={{ position: "absolute", right: 0, top: 0, whiteSpace: "nowrap" }}>
                        <Cell math={tightSign(texSpacing(row.cells[c] ?? ""))} color={row.successCols?.includes(c) ? "var(--green)" : color} align="right" />
                      </div>
                    </div>
                  </div>
                );
              }
              // The note under the first number after the "=" ("-0.5" under
              // "5") can't reach back toward the "=" - the note under the
              // other side ends right there. It ends where the number above
              // ends when it fits under it with only its sign sticking out
              // ("-12" under "27"); a wider note starts at the number's left
              // edge instead (its sign just in front) and runs on to the
              // right, where there's room. An invisible copy of the number
              // above sets the width, so nothing is measured.
              const underFirstRight = side === "right" && i === 0 && !alignColumns && !spans(row, c) && !isBlankCell(row.cells[c]);
              const numberAbove = underFirstRight && aboveCell ? aboveCell.replace(/^MARKEDTERM:/, "") : undefined;
              if (numberAbove && !/^[A-Z]+:/.test(numberAbove)) {
                const noteCell = <Cell math={tightSign(texSpacing(row.cells[c] ?? ""))} color={row.successCols?.includes(c) ? "var(--green)" : color} align="right" />;
                return (
                  <div key={c} data-row-slot={dataSlot} data-col={c} style={{ gridRow: 1, gridColumn: i + 1, justifySelf: "start", width: 0, overflow: "visible", paddingTop: padTop || undefined, paddingBottom: padBottom || undefined, transform: liftOf(c) }}>
                    <div style={{ position: "relative", width: "fit-content" }}>
                      <div aria-hidden="true" style={{ height: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}>
                        <Cell math={naturalSign(texSpacing(numberAbove))} color="var(--ink)" align="left" />
                      </div>
                      {/* (holds the line's height; takes no width) */}
                      <div aria-hidden="true" style={{ width: 0, overflow: "hidden", visibility: "hidden", whiteSpace: "nowrap" }}>
                        {noteCell}
                      </div>
                      {/* as wide as the number above plus room for a sign in
                          front; the note sits at its right end when it fits
                          (margin-left: auto), and starts at its left end -
                          running past the right - when it doesn't */}
                      <div style={{ position: "absolute", top: 0, left: "-0.8em", right: 0, display: "flex", whiteSpace: "nowrap" }}>
                        <div style={{ marginLeft: "auto", flex: "none" }}>{noteCell}</div>
                      </div>
                    </div>
                  </div>
                );
              }
              // (a note under a whole side - "+3" under "2x² + 7x" - spans
              // the term's columns like the side itself, so it ends where
              // that side ends)
              if (i > 0 && spans(row, cols[i - 1])) return null;
              return (
                <div
                  key={c}
                  data-row-slot={dataSlot}
                  data-col={c}
                  style={{
                    gridRow: 1,
                    gridColumn: spans(row, c) ? `${i + 1} / span 2` : i + 1,
                    justifySelf: fromLeft ? "start" : "end",
                    transform: liftOf(c),
                    width: 0,
                    display: "flex",
                    justifyContent: fromLeft ? "flex-start" : "flex-end",
                    overflow: "visible",
                    paddingTop: padTop || undefined, paddingBottom: padBottom || undefined,
                  }}
                >
                  <Cell math={tightSign(texSpacing(row.cells[c] ?? ""))} color={row.successCols?.includes(c) ? "var(--green)" : color} align="right" />
                </div>
              );
            }
            if (i > 0 && spans(row, cols[i - 1])) return null;
            const wide = spans(row, c);
            const text = texSpacing(row.cells[c] ?? "");
            return (
              <div
                key={c}
                data-row-slot={dataSlot}
                data-col={c}
                style={{
                  gridRow: 1,
                  gridColumn: wide ? `${i + 1} / span 2` : i + 1,
                  paddingTop: padTop || undefined, paddingBottom: padBottom || undefined,
                  // drawn without widening its column (GridRow.noWidthCols): a
                  // number after a sign extends to the right; a term before
                  // one ends where its column(s) end and extends to the left
                  ...(row.noWidthCols?.includes(c)
                    ? alignFor(c, wide ? 2 : 1) === "right"
                      ? { width: 0, overflow: "visible", justifySelf: "end", display: "flex", justifyContent: "flex-end", whiteSpace: "nowrap" as const }
                      : { width: 0, overflow: "visible", justifySelf: "start", whiteSpace: "nowrap" as const }
                    : {}),
                }}
              >
                <Cell
                  math={topify(startsTerm(row.cells, c, cols) ? naturalSign(text) : spaceJoiningSign(text), slotId, c)}
                  // a second inequality sign, or "or"/"and": same color as the anchor sign
                  color={isConnector(row.cells[c]) ? "var(--ink-soft)" : row.successCols?.includes(c) ? "var(--green)" : color}
                  align={alignFor(c, wide ? 2 : 1)}
                />
              </div>
            );
          })}
      </div>
    );
  }

  const groups = Array.from(new Set(slotOrderAll.map((id) => groupOf[id])));

  return (
    <div
      style={{
        overflowX: "auto",
        width: "100%",
        paddingTop: 14,
        // room for an answer's box at the bottom and at either side (the same from the first step)
        paddingBottom: hasBoxes ? BOX_PAD_Y + 8 : 4,
        paddingLeft: Math.max(crossLoops ? 18 : 0, hasBoxes ? BOX_PAD_X + 4 + overhang : overhang) || undefined,
        paddingRight: hasBoxes ? BOX_PAD_X + 4 : undefined,
      }}
    >
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
        {markSpecs.length > 0 && (
          <svg aria-hidden="true" width="1" height="1" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {markGeo.marks.filter((m) => m.shown).map((m, mi) => (
              <path key={`mk-${mi}`} d={m.d} fill="none" stroke={m.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
        )}
        {moveSpecs.length > 0 && (
          <svg aria-hidden="true" width="1" height="1" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {Object.values(moveGeo.arrows).flat().filter((a) => a.shown).map((a, ai) => (
              <g key={`mv-${ai}`}>
                <path d={a.d} fill="none" stroke="var(--blue)" strokeWidth={1.8} strokeLinecap="round" />
                <polygon points={a.head} fill="var(--blue)" />
              </g>
            ))}
          </svg>
        )}
        {moveSpecs.flatMap(({ slot, spec }) =>
          spec.labels.map((lab, k) => {
            const geo = moveGeo.arrows[slot]?.[k];
            return (
              <div
                key={`mvl-${slot}-${k}`}
                data-move-label={`${slot}-${k}`}
                aria-hidden={!geo?.shown}
                style={{ position: "absolute", left: geo?.lx ?? 0, top: geo?.ly ?? 0, fontSize: 15, color: "var(--blue)", whiteSpace: "nowrap", lineHeight: 1, visibility: geo?.shown ? "visible" : "hidden", pointerEvents: "none" }}
              >
                <InlineMath math={lab} />
              </div>
            );
          })
        )}
        {boxes.map((b, bi) => (
          <div
            key={`box-${bi}`}
            aria-hidden="true"
            style={{ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, border: "1.5px solid var(--ink)", borderRadius: 4, pointerEvents: "none" }}
          />
        ))}
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
                <span data-caption="">{row.caption}</span>
              </div>
            );
          }
          const group = groupOf[slotId] ?? slotId;
          const reserve = arcReserveSlots.has(slotId) || distributeAnnotations.some((a) => a.targetSlotId === slotId && a.arcsShown > 0);
          const eqSym = row.cells[e] ?? "";
          return [
            <div key={`${slotId}-l`} data-line={slotId} aria-hidden={hidden || undefined} style={{ ...hide, gridRow, gridColumn: 1, alignSelf: fracCoefSlot(slotId) ? "baseline" : undefined, justifySelf: "end", marginBottom: mb, marginTop: tuck[slotId] ? -tuck[slotId] : undefined, paddingRight: loopGap(slotId) }}>
              <SideBlock group={group} side="left" row={row} slotId={slotId} hidden={hidden} />
            </div>,
            <div
              key={`${slotId}-eq`}
              data-row-slot={hidden ? undefined : slotId}
              data-col={e}
              aria-hidden={hidden || undefined}
              data-line={slotId}
              style={{ ...hide, gridRow, gridColumn: 2, alignSelf: fracCoefSlot(slotId) ? "baseline" : undefined, textAlign: "center", color: "var(--ink-soft)", whiteSpace: "nowrap", paddingTop: reserve ? 34 : undefined, marginBottom: mb, marginTop: tuck[slotId] ? -tuck[slotId] : undefined }}
            >
              {eqSym.startsWith("SPILL:")
                ? (() => {
                    // A sign and number written from the start of the anchor
                    // column without widening it (compound inequalities: the
                    // "≤ 7" of the problem as given, above the "and").
                    const [sym, rest] = eqSym.slice("SPILL:".length).split("\u0005");
                    return (
                      <div style={{ width: 0, overflow: "visible", whiteSpace: "nowrap", textAlign: "left" }}>
                        <InlineMath math={sym} />
                        <span style={{ marginLeft: TEX_THICK_SPACE, color: colorFor(row.highlight) }}>
                          <InlineMath math={rest} />
                        </span>
                      </div>
                    );
                  })()
                : eqSym
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
            <div key={`${slotId}-r`} data-line={slotId} aria-hidden={hidden || undefined} style={{ ...hide, gridRow, gridColumn: 3, alignSelf: fracCoefSlot(slotId) ? "baseline" : undefined, justifySelf: "start", marginBottom: mb, marginTop: tuck[slotId] ? -tuck[slotId] : undefined, paddingLeft: loopGap(slotId) }}>
              <SideBlock group={group} side="right" row={row} slotId={slotId} hidden={hidden} />
            </div>,
          ];
        })}
        {crossLoops?.shown && <CrossLoops containerRef={gridRef} slotId={crossLoops.slotId} color="var(--blue)" />}
      </div>
    </div>
  );
}

// The pop-up that lets the student choose how numbers that aren't whole
// are written. It shows the number that was just found (or clicked) each
// way it can be written; picking one rewrites the numbers that way - every
// number in the work, the questions and the answer choices in a problem
// worked with a calculator, and just the final answer in any other. Drawn over the top right
// of the work, so it never moves the work itself.
function NumberFormPopup({
  title,
  numberKey,
  current,
  onPick,
  onClose,
}: {
  title: string;
  numberKey: string;
  current: NumberForm | null;
  onPick: (form: NumberForm) => void;
  onClose: () => void;
}) {
  const forms = formsOfNumber(numberKey);
  if (forms.length < 2) return null;
  return (
    // (no height, and its share of the panel's spacing taken back, so the
    // work underneath stays exactly where it is)
    <div style={{ position: "relative", height: 0, marginBottom: -16, zIndex: 5 }}>
      <div
        role="dialog"
        aria-label="How numbers are written"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          maxWidth: "100%",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderTop: "3px solid var(--blue)",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(28, 43, 69, 0.18)",
          padding: "12px 14px 14px",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--ink-soft)", padding: 2 }}
          >
            ×
          </button>
        </div>
        <div role="radiogroup" aria-label="Number form" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {forms.map((f) => {
            const active = current === f.form;
            return (
              <button
                key={f.form}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPick(f.form)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  minWidth: 96,
                  border: `1.5px solid ${active ? "var(--blue)" : "var(--line)"}`,
                  background: active ? "rgba(46, 111, 163, 0.1)" : "var(--paper)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <span className="mixed-math" style={{ fontSize: 18, minHeight: 44, display: "flex", alignItems: "center" }}>
                  <InlineMath math={f.tex} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>{f.label}</span>
              </button>
            );
          })}
        </div>
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
  const [rawInstance, setRawInstance] = useState<SolverInstance | null>(null);
  // How the student has chosen to see numbers that aren't whole (fractions,
  // mixed numbers or decimals; null = as written) - for problems that allow
  // it. The work, the questions and the answer choices all follow it.
  const [numberForm, setNumberForm] = useState<NumberForm | null>(null);
  // The pop-up offering that choice, for one number (its tag, "9-2"): shown
  // when the student clicks a number, and by itself the first time an
  // answer in the problem isn't a whole number.
  const [formPopup, setFormPopup] = useState<string | null>(null);
  const formPromptedRef = useRef(false);
  // (a problem worked with a calculator: every number; any other problem:
  // just its final answer)
  const instance = useMemo(
    () => (rawInstance ? applyNumberForms(rawInstance, numberForm, rawInstance.switchableNumbers ? "all" : "answers") : rawInstance),
    [rawInstance, numberForm]
  );
  const setInstance = (next: SolverInstance) => {
    setRawInstance(next);
    setNumberForm(null);
    setFormPopup(null);
    formPromptedRef.current = false;
  };
  function handleNumberClick(e: MouseEvent<HTMLElement>) {
    const key = ((e.target as HTMLElement).closest?.("[data-nf]") as HTMLElement | null)?.getAttribute("data-nf");
    if (key) setFormPopup(key);
  }
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  // (the "Are you sure?" pop-up before Start over)
  const [confirmRestart, setConfirmRestart] = useState(false);
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

  // The work and the factor-pairs list beside it: measured, so the work
  // side of the card is always at least wide enough for both side by side
  // (some of the work is drawn past its own box, so CSS alone can't tell).
  const sideWrapRef = useRef<HTMLDivElement | null>(null);
  const [sideNeed, setSideNeed] = useState(0);
  useLayoutEffect(() => {
    const wrap = sideWrapRef.current;
    if (!wrap || wrap.children.length < 2) return;
    const [work, list] = Array.from(wrap.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(wrap).columnGap) || 0;
    const panel = wrap.closest(".step-solver-panel-left") as HTMLElement | null;
    const pad = panel ? parseFloat(getComputedStyle(panel).paddingLeft) + parseFloat(getComputedStyle(panel).paddingRight) + 1 : 0;
    const need = Math.ceil(work.offsetWidth + gap + list.offsetWidth + pad);
    if (Math.abs(need - sideNeed) > 1) setSideNeed(need);
  });

  useEffect(() => {
    setInstance(signChoices(generate()));
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
    applyUpdates(instance.steps[i].rowUpdatesOnShow ?? []);
    applyUpdates(instance.steps[i].rowUpdates);
  }
  // (changes made as soon as a question is asked - a number it's about,
  // highlighted)
  applyUpdates(currentStep.rowUpdatesOnShow ?? []);
  if (revealed) {
    applyUpdates(currentStep.rowUpdates);
  }

  const visibleRows: (GridRow | PairedGridRow)[] = slotOrder.map((id) => slotContent[id]);
  // Numbers the student can choose the form of: the last one on the card
  // now (what the "change how it's written" button opens), and whether the
  // problem will ever have one (so the button's room is kept from the start).
  const switchTag = lastSwitchableTag(visibleRows);
  const everSwitchable =
    lastSwitchableTag([instance.initialRow, ...instance.steps.flatMap((st) => [...(st.rowUpdatesOnShow ?? []), ...st.rowUpdates].map((u) => u.row))]) !== null;

  // Proportions: the cross-multiply loops, once that step is answered.
  const crossLoopsIdx = instance.crossLoops ? instance.steps.findIndex((st) => st.stepId === instance.crossLoops!.afterStepId) : -1;
  const crossLoopsState = instance.crossLoops
    ? {
        slotId: instance.crossLoops.slotId,
        shown: crossLoopsIdx !== -1 && (stepIndex > crossLoopsIdx || (stepIndex === crossLoopsIdx && revealed)),
      }
    : undefined;

  // A list beside the work (factor pairs): the newest one whose step has
  // been answered. Its room is held from the first step.
  const sideListAll = instance.steps.find((st) => st.sideList)?.sideList;
  // (the fullest version: the most items, and the note if any step has one)
  const sideLists = instance.steps.flatMap((st) => (st.sideList ? [st.sideList] : []));
  const sideListFull: SideList | undefined = sideListAll && {
    ...sideLists.reduce((best, l) => (l.items.length > best.items.length ? l : best), sideListAll),
    note: sideLists.find((l) => l.note !== undefined)?.note,
    marked: undefined,
  };
  let sideListShown: SideList | undefined;
  instance.steps.forEach((st, i) => {
    if (st.sideList && (stepIndex > i || (stepIndex === i && revealed))) sideListShown = st.sideList;
  });

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
    for (const step of instance.steps) for (const u of [...(step.rowUpdatesOnShow ?? []), ...step.rowUpdates]) add(u.slotId, u.row);
  }

  // Rows that will ever carry distribute arrows keep the arrows' headroom
  // from the moment they appear, so the arrows never push anything down.
  const arcReserveKeys = new Set<string>();
  for (const step of instance.steps) {
    const dv = step.distributeVisual;
    if (dv) arcReserveKeys.add(`${dv.targetSlotId ?? "__initial__"}|${dv.equation ?? ""}`);
  }
  // (...and a line the LCD is written around, for its arrows)
  for (const [id, versions] of Object.entries(slotVersions)) {
    // (only a side that's being distributed has arrows)
    if (versions.some((r) => r.cells.some((c) => c.startsWith(LCDWRAP_PREFIX) && c.includes('"single":false')))) arcReserveKeys.add(`${id}|`);
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
    | ComputedAnnotation
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
    const arcsFor = (idx1: number, idx2: number): 0 | 1 | 2 => {
      if (idx1 === -1 || idx2 === -1) return 0;
      if (stepIndex < idx1) return 0;
      if (stepIndex === idx1) return revealed ? 1 : 0;
      if (stepIndex < idx2) return 1;
      if (stepIndex === idx2) return revealed ? 2 : 1;
      return 2; // past both - stays at 2 regardless of later steps' own reveal state
    };
    const arcsShown = arcsFor(idx1, idx2);
    const chain = content.chain?.map((g) => ({
      lead: g.lead,
      coefficient: g.coefficient,
      term1: g.term1,
      term2: g.term2,
      arcsShown: arcsFor(steps.findIndex((s) => s.stepId === g.firstTermStepId), steps.findIndex((s) => s.stepId === g.secondTermStepId)),
    }));
    // eqColumnIndex is 2 for expressionLeft (term cells at 0,1) or 1 for
    // expressionRight (term cells at 2,3) - see eqColumnIndexFor. This
    // only holds when there are exactly 2 term columns; content.termCols
    // overrides it explicitly for a skill using more.
    const termCols: [number, number] = content.termCols ?? (eqColIdx === 2 ? [0, 1] : [2, 3]);
    return {
      coefficient: content.coefficient,
      term1: content.term1,
      term2: content.term2,
      arcsShown: chain?.length ? (Math.max(arcsShown, ...chain.map((g) => g.arcsShown)) as 0 | 1 | 2) : arcsShown,
      ...(chain?.length ? { chain, ownArcs: arcsShown } : {}),
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
      // The first answer that isn't a whole number: offer the student the
      // choice of how numbers like it are written.
      // (an answer that is itself a number, like "9/2" or "x = 9/2" - not a
      // sentence that mentions one, like "Dividing both sides by 3/4")
      // (in a problem where only the final answer can be switched, that's
      // the step that writes the answer line)
      const answerText = currentStep.choices[i].text;
      const writesAnswer = currentStep.rowUpdates.some((u) => (u.row as GridRow).highlight === "success");
      if ((instance!.switchableNumbers || writesAnswer) && !formPromptedRef.current && /^\$[^$]+\$$/.test(answerText)) {
        const key = firstSwitchableNumber(answerText);
        if (key) {
          formPromptedRef.current = true;
          setFormPopup(key);
        }
      }
    }
  }

  // Shared by both Previous and "Next into already-answered territory":
  // jumps to a step and, if it's already been answered before, shows it
  // immediately in its answered state (correct choice highlighted)
  // rather than making the student re-click it.
  function goToStep(newIndex: number, alreadyAnswered: boolean) {
    setFormPopup(null);
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

  // Start over: the same problem again from its first question, with
  // nothing answered. Asked for first, since the work so far is wiped.
  function handleStartOver() {
    setConfirmRestart(false);
    setFormPopup(null);
    setStepIndex(0);
    setSelected(null);
    setRevealed(false);
    setFurthestStepIndex(0);
    celebratedRef.current = false;
    setCelebration(null);
  }

  function handleNewProblem() {
    setInstance(signChoices(generate()));
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
        /* A fraction bar written in the math is as thick as the bars the
           solver draws itself (the divide-both-sides lines), so every
           fraction in the work looks the same. */
        .katex .frac-line {
          border-bottom-width: 0.06em !important;
        }
      `}</style>
      {celebration !== null && <Celebration celebrationKey={celebration} onDone={() => setCelebration(null)} />}
      {confirmRestart && (
        // (a fixed overlay: it sits over the page and moves nothing under it)
        <div
          onClick={() => setConfirmRestart(false)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20, 24, 40, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="start-over-title"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--card)", border: "1px solid var(--line)", borderTop: "3px solid var(--coral)", borderRadius: 14, padding: "22px 24px", maxWidth: 380, width: "100%" }}
          >
            <div id="start-over-title" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--ink)", marginBottom: 6 }}>
              Are you sure?
            </div>
            <div style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 18 }}>Your progress will be lost.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                autoFocus
                onClick={() => setConfirmRestart(false)}
                style={{ background: "var(--paper)", color: "var(--ink)", border: "1.5px solid var(--line)", borderRadius: 999, padding: "9px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Keep going
              </button>
              <button
                onClick={handleStartOver}
                style={{ background: "var(--coral)", color: "#fff", border: "none", borderRadius: 999, padding: "9px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
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
          .side-list-wrap {
            flex-wrap: wrap !important;
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
          // With a list beside the work (factor pairs), the work side is
          // never narrower than the work and the list side by side - the
          // question side gives up the room instead.
          gridTemplateColumns: instance.panelRatio ?? (!isSystem && sideListAll ? `minmax(${sideNeed}px, 1fr) minmax(0, 1fr)` : "1fr 1fr"),
          border: "1px solid var(--line)",
          borderRadius: 16,
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
      {/* LEFT: math */}
      <div
        className="step-solver-panel-left"
        onClick={handleNumberClick}
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
        {/* The notice that a number's form can be chosen: a button, always
            in the same spot under the skill's name. Its room is kept from the
            first step in any problem that will have such a number, and it
            shows as soon as one is on the card. */}
        {everSwitchable && (
          <div style={{ marginTop: -6, visibility: switchTag ? "visible" : "hidden" }} aria-hidden={!switchTag}>
            <button
              type="button"
              tabIndex={switchTag ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                if (switchTag) setFormPopup(switchTag);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1.5px solid var(--blue)",
                background: "rgba(46, 111, 163, 0.08)",
                color: "var(--blue)",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">⇄</span>
              {instance.switchableNumbers ? "Change how numbers are written: fraction, mixed number or decimal" : "Change how the answer is written: fraction, mixed number or decimal"}
            </button>
          </div>
        )}
        {formPopup && (
          <NumberFormPopup
            title={instance.switchableNumbers ? "How do you want numbers written?" : "How do you want the answer written?"}
            numberKey={formPopup}
            current={numberForm}
            onPick={(form) => {
              setNumberForm(form);
              setFormPopup(null);
            }}
            onClose={() => setFormPopup(null)}
          />
        )}
        {instance.problemText && (
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)" }}>
            <MixedText content={instance.problemText} />
          </div>
        )}
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
          <div ref={sideWrapRef} className={sideListAll ? "side-list-wrap" : undefined} style={sideListAll ? { display: "flex", flexWrap: "nowrap", alignItems: "flex-start", columnGap: 28, maxWidth: "100%" } : undefined}>
          {/* The work never shrinks to make room for the list beside it
              (squeezed columns would stretch again when a wide answer
              appears), and the list always stays to the right of the work
              (the question panel is narrower for these). Only on a phone,
              where there's no room beside it, does the list go below. */}
          <div style={sideListAll ? { flex: "none", maxWidth: "100%" } : undefined}>
          <AnchoredEquation
            rows={visibleRows as GridRow[]}
            slotIds={slotOrder}
            slotVersions={slotVersions}
            slotOrderAll={slotOrderAll}
            eqColumnIndex={instance.eqColumnIndex}
            distributeAnnotations={distributeAnnotations}
            arcReserveSlots={new Set([...arcReserveKeys].filter((k) => k.endsWith("|")).map((k) => k.slice(0, -1)))}
            crossLoops={crossLoopsState}
            alignColumns={instance.alignColumns}
          />
          </div>
          {sideListAll && sideListFull && <SideListPanel list={sideListShown ?? sideListFull} full={sideListFull} shown={!!sideListShown} />}
          </div>
        )}
        {/* The finished number line, under the work. Its room is held from
            the first step (invisible until the graph question is answered),
            so nothing moves and the card never grows when it appears. */}
        {!isSystem && answerGraph && (
          <div
            aria-hidden={!answerGraphShown}
            style={{ visibility: answerGraphShown ? "visible" : "hidden", maxWidth: 340, marginTop: 4 }}
          >
            <GraphFromText text={answerGraph} markerId="answer-graph" color="var(--green)" align="left" />
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
          // the question always sits at the top of its panel, however tall
          // the work on the left gets
          alignItems: isSystem ? undefined : "start",
          alignContent: isSystem ? undefined : "start",
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
                        <GraphFromText text={choice.text} markerId={`probe-graph-${si}-${ci}`} />
                      ) : (
                        <MixedText content={autoMath(choice.text)} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* The widest the button row ever gets (on the last step), so the
                  panel never widens - and number lines never grow - at the end. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                <div style={{ padding: "9px 20px", fontSize: 14, fontWeight: 700, border: "1.5px solid transparent", whiteSpace: "nowrap" }}>
                  ← Previous step
                </div>
                <div style={{ padding: "9px 20px", fontSize: 14, fontWeight: 700, border: "1.5px solid transparent", whiteSpace: "nowrap" }}>
                  ↺ Start over
                </div>
                <div style={{ padding: "9px 20px", fontSize: 14, fontWeight: 700, border: "1.5px solid transparent", whiteSpace: "nowrap" }}>
                  {finalButtonLabel}
                </div>
              </div>
            </div>
          ))}
        {currentStep && !isSystem && (
          <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 14, minWidth: 0 }}>
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
                  background: "var(--green)",
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
                      <GraphFromText text={choice.text} markerId={`graph-arrow-${i}`} />
                    ) : (
                      <MixedText content={autoMath(choice.text)} />
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
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
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  ← Previous step
                </button>
              )}
              {/* (not on a finished problem whose last button already starts it over) */}
              {(stepIndex > 0 || revealed) && !(revealed && isLastStep && /over/i.test(finalButtonLabel)) && (
                <button
                  onClick={() => setConfirmRestart(true)}
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--coral)",
                    color: "#fff",
                    border: "1.5px solid var(--coral)",
                    borderRadius: 999,
                    padding: "9px 20px",
                    fontSize: 14,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  ↺ Start over
                </button>
              )}
              {revealed && !isLastStep && (
                <button
                  onClick={handleNext}
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--green)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 999,
                    padding: "9px 20px",
                    fontSize: 14,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
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
                    whiteSpace: "nowrap",
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
