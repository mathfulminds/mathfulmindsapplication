// Quadratics by square roots: (x - 3)² = 16,  (2x + 1)² = 49,  2(x + 1)² - 3 = 47.
//
//   1. If there's a number in front of / added to the square, undo it first
//      (the same moves as Absolute Value Equations), until the square is by
//      itself: (x + 1)² = 25.
//   2. Take the square root of both sides. Two numbers square to 25 - 5 and
//      -5 - so it's ±5. (A negative number: nothing squares to it, so there
//      is no real solution.)
//   3. That splits into two equations, x + 1 = 5  or  x + 1 = -5, each
//      solved like any other equation - the first all the way, then the
//      second - side by side with "or" staying in the same place (the same
//      layout as Absolute Value Equations).

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import type { ComparisonSymbol } from "./inequalityCore";
import {
  REL,
  JOIN,
  buildTwoPart,
  goalChoices,
  cancelStep,
  combinePrompt,
  divideChoices,
  coefficientOneStep,
  computeStep,
  withCorrect,
  dedup,
} from "./compoundInequalities";

export interface SqProblem {
  a: number; // a·(m x + n)² + b = c
  b: number;
  m: number;
  n: number;
  c: number;
}

const EQ = "=" as unknown as ComparisonSymbol;
const plainTerm = (c: number, x: string) => (c === 1 ? x : c === -1 ? `-${x}` : `${c}${x}`);
const innerText = (m: number, n: number, x: string) => `${plainTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;
const innerTex = (m: number, n: number, x: string) => `${renderMultiplyTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;
// The same strut Square & Cube Roots uses: the bar sits a little above the
// exponent, and the bars on both sides of the = are the same height.
const STRUT = "\\rule[-0.1em]{0pt}{1.15em}";
const root = (t: string) => `\\sqrt{${t}${STRUT}}`;
// The square root is taken right on its line, so the line holds an
// invisible, zero-width copy of the root from the start: it's already as
// tall as it will be, and nothing on it shifts when the root appears.
// (That line's pieces line up on their baseline, so the "=" and the number
// sit level with the math whatever its height - see GridRow.baseline.)
const ghostRoot = (t: string) => `\\mathllap{\\textcolor{transparent}{${root(t)}}}${t}`;

// (mx + n)² = k, once the square is by itself
export function sqValue(p: SqProblem): number {
  return (p.c - p.b) / p.a;
}

export function buildSqInstance(p: SqProblem, x: string = "x"): SolverInstance {
  const { a, b, m, n, c } = p;
  const k = sqValue(p);
  const sqTex = `(${innerTex(m, n, x)})^2`;
  const sqText = `(${innerText(m, n, x)})²`;
  const e = 4;
  // the line the square root is taken on (before and after)
  const rootLine = (term: string, val: string): GridRow => ({
    cells: [term, BLANK, REL(EQ), val, BLANK, BLANK, BLANK, BLANK, BLANK],
    spanNext: [0],
    noWidthCols: [0, 3],
    baseline: true,
  });
  const line = (term: string, cst: string, val: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: [term, cst, REL(EQ), val, BLANK, BLANK, BLANK, BLANK, BLANK],
    spanNext: [0],
    noWidthCols: [0, 3],
    ...(highlight ? { highlight } : {}),
  });
  const notes = (cst: string, val: string): GridRow => ({ cells: [BLANK, cst, BLANK, val, "", BLANK, BLANK, BLANK, BLANK] });

  const initialRow: GridRow =
    a === 1 && b === 0
      ? rootLine(ghostRoot(sqTex), `${c}`)
      : {
          cells: [renderMultiplyTerm(a, sqTex), b === 0 ? BLANK : renderConstant(b, true), REL(EQ), `${c}`, BLANK, BLANK, BLANK, BLANK, BLANK],
          ...(b === 0 ? { spanNext: [0] } : {}),
          noWidthCols: b === 0 ? [0, 3] : [3], // the lines before the split don't widen its columns
        };
  const steps: SolverStep[] = [];
  let curSlot = "__initial__";

  // ---------- 1. get the square by itself ----------
  if (b !== 0) {
    const cTex = renderConstant(-b, true, false);
    steps.push({
      stepId: "sq_goal_constant",
      rowUpdates: [{ slotId: "sq_annotation", row: notes(cTex, cTex) }],
      prompt: `First, get the square by itself. What undoes the ${b >= 0 ? "+" : ""}${b}?`,
      choices: goalChoices(b, "both sides", "the side with the square only"),
      explanationOnCorrect: b >= 0 ? `Undo addition by subtracting ${b} from both sides.` : `Undo subtraction by adding ${-b} to both sides.`,
    });
    const cs = cancelStep(b, [
      { slotId: "__initial__", row: { ...initialRow, cells: initialRow.cells.map((x2, i) => (i === 1 ? `MARKEDTERM:${x2}` : x2)) } },
      { slotId: "sq_annotation", row: notes(`MARKEDTERM:${cTex}`, cTex) },
    ]);
    cs.stepId = "sq_cancel_constant";
    steps.push(cs);
    const cp = combinePrompt(c, b);
    steps.push({
      stepId: "sq_combine_constant",
      rowUpdates: [{ slotId: "sq_simplified", row: a === 1 ? rootLine(ghostRoot(sqTex), `${c - b}`) : line(renderMultiplyTerm(a, sqTex), BLANK, `${c - b}`) }],
      prompt: cp.prompt,
      choices: cp.choices,
      explanationOnCorrect: `The terms combine to ${c - b}. The rest of the equation gets brought down unchanged.`,
    });
    curSlot = "sq_simplified";
  }
  if (a !== 1) {
    const flat = c - b;
    const divSlot = curSlot; // divided in place, under the line it's on
    const divLine = (marked: boolean) =>
      line(marked ? `MARKEDFRACTION:${a}\u0006${sqTex}\u0005${a}` : `\\dfrac{${renderMultiplyTerm(a, sqTex)}}{${a}}`, BLANK, `\\dfrac{${flat}}{${a}}`);
    steps.push({
      stepId: "sq_eliminate_coefficient",
      rowUpdates: [{ slotId: divSlot, row: divLine(false) }],
      prompt: `${b === 0 ? "First, get the square by itself. " : ""}What undoes multiplying ${sqText} by ${a}?`,
      choices: divideChoices(a, "both sides", b),
      explanationOnCorrect: `The ${a} cancels when we divide both sides by ${a}.`,
    });
    const co = coefficientOneStep(a, [
      { slotId: divSlot, row: divLine(true) },
      { slotId: "sq_isolated", row: rootLine(ghostRoot(sqTex), BLANK) },
    ]);
    co.stepId = "sq_confirm_coefficient_one";
    co.explanationOnCorrect = `The ${a} divided by itself is 1, so the square is by itself.`;
    steps.push(co);
    steps.push(computeStep("sq_compute_value", flat, a, [{ slotId: "sq_isolated", row: rootLine(ghostRoot(sqTex), `${k}`) }], "", `What is ${sqText} equal to?`));
  }

  // ---------- 2. square root of both sides ----------
  // taken right on the line where the square is by itself (like dividing in
  // place) - no new line
  const sqSlot = a !== 1 ? "sq_isolated" : curSlot;
  steps.push({
    stepId: "sq_goal_root",
    rowUpdates: [{ slotId: sqSlot, row: rootLine(root(sqTex), root(`${k}`)) }],
    prompt: `What undoes squaring (${innerText(m, n, x)})?`,
    choices: shuffle<Choice>([
      { text: "Taking the square root of both sides", isCorrect: true, misconceptionTag: null },
      { text: "Dividing both sides by 2", isCorrect: false, misconceptionTag: "thinks_square_means_times_two" },
      { text: "Taking the cube root of both sides", isCorrect: false, misconceptionTag: "wrong_root" },
    ]),
    explanationOnCorrect: `A square root undoes a square: the square root of ${sqText} is just ${innerText(m, n, x)}.`,
  });

  if (k < 0) {
    steps.push({
      stepId: "sq_count_roots",
      rowUpdates: [{ slotId: "sq_answer", row: { cells: [], caption: "No real solution", highlight: "success" } }],
      prompt: `Can you square a number and get ${k}?`,
      choices: shuffle<Choice>([
        { text: "No - a number times itself is never negative", isCorrect: true, misconceptionTag: null },
        { text: `Yes: (-${Math.round(Math.sqrt(-k)) || 1})² = ${k}`, isCorrect: false, misconceptionTag: "thinks_square_can_be_negative" },
      ]),
      explanationOnCorrect: `Positive × positive and negative × negative are both positive, so nothing squared gives ${k}. There is no real solution.`,
    });
    return { initialRow, steps, eqColumnIndex: e, columnCount: 9, termAlign: "right", alignColumns: true };
  }

  const r = Math.round(Math.sqrt(k));
  steps.push({
    stepId: "sq_count_roots",
    rowUpdates: [{ slotId: sqSlot, row: rootLine(root(sqTex), `\\pm${root(`${k}`)}`) }],
    prompt: `How many numbers can you square to get ${k}?`,
    choices: shuffle<Choice>([
      { text: `Two: ${r} and -${r}`, isCorrect: true, misconceptionTag: null },
      { text: `One: ${r}`, isCorrect: false, misconceptionTag: "forgot_negative_root" },
      { text: "None", isCorrect: false, misconceptionTag: "no_roots" },
    ]),
    explanationOnCorrect: `${r}² = ${k} and (-${r})² = ${k}, so both work. That's why we write ± (plus or minus).`,
  });

  // ---------- 3. split into two equations ----------
  const split: GridRow = {
    cells: [renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(EQ), `${r}`, JOIN("or"), renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(EQ), `${-r}`],
  };
  const inner = innerText(m, n, x);
  const answer = `${inner} = ${r} or ${inner} = ${-r}`;
  steps.push({
    stepId: "sq_split",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `So ${inner} = ±√${k}. Which two equations does that make?`,
    choices: withCorrect(answer, dedup(answer, [
      { text: `${inner} = ${r} only`, tag: "forgot_negative_root" },
      { text: `${inner} = ${k} or ${inner} = ${-k}`, tag: "forgot_square_root" },
      { text: `${inner} = ${r} or ${inner} = ${r * 2}`, tag: "wrong_second_case" },
    ], 2)),
    explanationOnCorrect: `√${k} = ${r}, so ${inner} can be ${r} or ${-r} (both square to ${k}). It splits into two equations, one for each.`,
  });

  // ---------- 4. solve both ----------
  return buildTwoPart(
    { kind: "twoPart", join: "or", p1: { a: m, b: n, sym: EQ, rhs: r }, p2: { a: m, b: n, sym: EQ, rhs: -r } },
    x,
    { equation: true, lead: { initialRow, steps, startSlot: "split" } }
  );
}

// ---------- practice problems ----------
export function generateSqProblem(): SqProblem {
  for (;;) {
    const m = Math.random() < 0.7 ? 1 : randInt(2, 3) * (Math.random() < 0.15 ? -1 : 1);
    const n = randInt(1, 9) * (randBool() ? 1 : -1);
    const negative = Math.random() < 0.08;
    const r = randInt(1, 9);
    const k = negative ? -randInt(1, 9) : r * r;
    if (!negative && ((r - n) % m !== 0 || (-r - n) % m !== 0)) continue;
    if (Math.random() < 0.4) {
      const a = Math.random() < 0.3 ? 1 : randInt(2, 4) * (Math.random() < 0.15 ? -1 : 1);
      const b = Math.random() < 0.3 ? 0 : randInt(1, 9) * (randBool() ? 1 : -1);
      if (a === 1 && b === 0) continue;
      return { a, b, m, n, c: a * k + b };
    }
    return { a: 1, b: 0, m, n, c: k };
  }
}

export function generateSqInstance(): SolverInstance {
  return buildSqInstance(generateSqProblem());
}
