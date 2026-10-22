// Absolute value equations: |x - 3| = 5,  |2x + 1| = 7,  2|x - 3| + 1 = 9.
//
//   1. If there's a number in front of / added to the absolute value, undo
//      it first (the same moves as Two-Step Equations), until the absolute
//      value is by itself: |x - 3| = 4.
//   2. Can an absolute value be negative? If the other side is negative,
//      there's no solution.
//   3. Absolute value is distance from 0, so it splits into two equations:
//      x - 3 = 4  or  x - 3 = -4.
//   4. Each is solved like any other equation - the first all the way, then
//      the second - side by side with "or" staying in the same place (the
//      same layout as Compound Inequalities).

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle, divNumerator } from "./isolateVariableCore";
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

export interface AbsProblem {
  a: number; // a·|m x + n| + b = c
  b: number;
  m: number;
  n: number;
  c: number;
}

const EQ = "=" as unknown as ComparisonSymbol;
const plainTerm = (c: number, x: string) => (c === 1 ? x : c === -1 ? `-${x}` : `${c}${x}`);
const innerText = (m: number, n: number, x: string) => `${plainTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;
const innerTex = (m: number, n: number, x: string) => `${renderMultiplyTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;

export function absValue(p: AbsProblem): number {
  return (p.c - p.b) / p.a;
}

export function buildAbsInstance(p: AbsProblem, x: string = "x"): SolverInstance {
  const { a, b, m, n, c } = p;
  const k = (c - b) / a; // |mx + n| = k
  const absTex = `|${innerTex(m, n, x)}|`; // KaTeX draws plain bars well
  const absText = `|${innerText(m, n, x)}|`;
  const e = 4;
  // a line in the left inequality's columns (term, constant, =, value), with
  // "or" not shown yet
  const line = (term: string, cst: string, val: string, sym: string = REL(EQ), highlight?: GridRow["highlight"]): GridRow => ({
    cells: [term, cst, sym, val, BLANK, BLANK, BLANK, BLANK, BLANK],
    spanNext: [0],
    noWidthCols: [0, 3],
    ...(highlight ? { highlight } : {}),
  });
  const notes = (cst: string, val: string): GridRow => ({ cells: [BLANK, cst, BLANK, val, "", BLANK, BLANK, BLANK, BLANK] });

  const initialRow: GridRow = {
    cells: [renderMultiplyTerm(a, absTex), b === 0 ? BLANK : renderConstant(b, true), REL(EQ), `${c}`, BLANK, BLANK, BLANK, BLANK, BLANK],
    // nothing added on: the absolute value sits right against the =
    ...(b === 0 ? { spanNext: [0] } : {}),
    noWidthCols: b === 0 ? [0, 3] : [3], // the lines before the split don't widen its columns
  };
  const steps: SolverStep[] = [];
  let curSlot = "__initial__";

  // ---------- 1. get the absolute value by itself ----------
  if (b !== 0) {
    const cTex = renderConstant(-b, true, false);
    steps.push({
      stepId: "abs_goal_constant",
      rowUpdates: [{ slotId: "abs_annotation", row: notes(cTex, cTex) }],
      prompt: `First, get the absolute value by itself. What undoes the ${b >= 0 ? "+" : ""}${b}?`,
      choices: goalChoices(b, "both sides", "the absolute value side only"),
      explanationOnCorrect: b >= 0 ? `Undo addition by subtracting ${b} from both sides.` : `Undo subtraction by adding ${-b} to both sides.`,
    });
    const cs = cancelStep(b, [
      { slotId: "__initial__", row: { ...initialRow, cells: initialRow.cells.map((x2, i) => (i === 1 ? `MARKEDTERM:${x2}` : x2)) } },
      { slotId: "abs_annotation", row: notes(`MARKEDTERM:${cTex}`, cTex) },
    ]);
    cs.stepId = "abs_cancel_constant";
    steps.push(cs);
    const cp = combinePrompt(c, b);
    steps.push({
      stepId: "abs_combine_constant",
      rowUpdates: [{ slotId: "abs_simplified", row: line(renderMultiplyTerm(a, absTex), BLANK, `${c - b}`, REL(EQ)) }],
      prompt: cp.prompt,
      choices: cp.choices,
      explanationOnCorrect: `The terms combine to ${c - b}. The rest of the equation gets brought down unchanged.`,
    });
    curSlot = "abs_simplified";
  }
  if (a !== 1) {
    const flat = c - b;
    // divide in place, under the line the absolute value is already on
    const divSlot = curSlot;
    const divLine = (marked: boolean) =>
      line(marked ? `MARKEDFRACTION:${a}\u0006${absTex}\u0005${a}` : `\\dfrac{${divNumerator(a, absTex)}}{${a}}`, BLANK, `\\dfrac{${flat}}{${a}}`);
    steps.push({
      stepId: "abs_eliminate_coefficient",
      rowUpdates: [{ slotId: divSlot, row: divLine(false) }],
      prompt: `${b === 0 ? "First, get the absolute value by itself. " : ""}What undoes multiplying ${absText} by ${a}?`,
      choices: divideChoices(a, "both sides", b),
      explanationOnCorrect: `The ${a} cancels when we divide both sides by ${a}.`,
    });
    const co = coefficientOneStep(a, [
      { slotId: divSlot, row: divLine(true) },
      { slotId: "abs_isolated", row: line(absTex, BLANK, BLANK) },
    ]);
    co.stepId = "abs_confirm_coefficient_one";
    co.explanationOnCorrect = `The ${a} divided by itself is 1, so the absolute value is by itself.`;
    steps.push(co);
    const cv = computeStep("abs_compute_value", flat, a, [{ slotId: "abs_isolated", row: line(absTex, BLANK, `${k}`) }], "", `What is ${absText} equal to?`);
    steps.push(cv);
  }

  // ---------- 2. negative: no solution ----------
  if (k < 0) {
    steps.push({
      stepId: "abs_negative",
      rowUpdates: [{ slotId: "abs_answer", row: { cells: [], caption: "No solution", highlight: "success" } }],
      prompt: `Can an absolute value equal ${k}?`,
      choices: shuffle<Choice>([
        { text: "No - an absolute value is a distance, so it's never negative", isCorrect: true, misconceptionTag: null },
        { text: `Yes, ${innerText(m, n, x)} = ${k}`, isCorrect: false, misconceptionTag: "thinks_absolute_value_can_be_negative" },
        { text: `Yes, ${innerText(m, n, x)} = ${-k}`, isCorrect: false, misconceptionTag: "drops_the_sign" },
      ]),
      explanationOnCorrect: `Absolute value is distance from 0, and a distance can't be negative. So nothing makes ${absText} = ${k}: there's no solution.`,
    });
    return { initialRow, steps, eqColumnIndex: e, columnCount: 9, termAlign: "right", alignColumns: true };
  }

  // ---------- 3. split into two equations ----------
  const split: GridRow = {
    cells: [renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(EQ), `${k}`, JOIN("or"), renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(EQ), `${-k}`],
    // |x| = 4: the two equations are already the answer
    ...(m === 1 && n === 0 ? { highlight: "success" as const } : {}),
  };
  const inner = innerText(m, n, x);
  const answer = `${inner} = ${k} or ${inner} = ${-k}`;
  steps.push({
    stepId: "abs_split",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `Absolute value is the distance from 0. Which two equations does ${absText} = ${k} make?`,
    choices: withCorrect(answer, dedup(answer, [
      { text: `${inner} = ${k} or ${innerText(-m, -n, x)} = ${k}`, tag: "negates_inside_only" },
      { text: `${inner} = ${k} or ${inner} = ${k === 0 ? 1 : k * 2}`, tag: "wrong_second_case" },
      { text: `${inner} = ${k} only`, tag: "forgot_negative_case" },
    ], 2)),
    explanationOnCorrect: `Both ${k} and ${-k} are ${k} away from 0, so what's inside the bars can be ${k} or ${-k}.`,
  });

  // ---------- 4. solve both ----------
  return buildTwoPart(
    { kind: "twoPart", join: "or", p1: { a: m, b: n, sym: EQ, rhs: k }, p2: { a: m, b: n, sym: EQ, rhs: -k } },
    x,
    { equation: true, lead: { initialRow, steps, startSlot: "split" } }
  );
}

// ---------- practice problems ----------
export function generateAbsProblem(): AbsProblem {
  for (;;) {
    const m = Math.random() < 0.5 ? 1 : randInt(2, 4) * (Math.random() < 0.15 ? -1 : 1);
    const n = Math.random() < 0.15 ? 0 : randInt(1, 9) * (randBool() ? 1 : -1);
    const negative = Math.random() < 0.08;
    const k = negative ? -randInt(1, 9) : randInt(1, 12);
    if (!negative && ((k - n) % m !== 0 || (-k - n) % m !== 0)) continue;
    if (n === 0 && m === 1 && Math.random() < 0.5) continue; // fewer |x| = k
    if (Math.random() < 0.35) {
      const a = Math.random() < 0.3 ? 1 : randInt(2, 4);
      const b = Math.random() < 0.3 ? 0 : randInt(1, 9) * (randBool() ? 1 : -1);
      if (a === 1 && b === 0) continue;
      return { a, b, m, n, c: a * k + b };
    }
    return { a: 1, b: 0, m, n, c: k };
  }
}

export function generateAbsInstance(): SolverInstance {
  return buildAbsInstance(generateAbsProblem());
}
