// Absolute value inequalities: |x - 3| < 5,  |2x + 1| >= 7,  2|x - 3| + 1 <= 9.
//
//   1. If there's a number in front of / added to the absolute value, undo
//      it first, the same moves as Absolute Value Equations - with the
//      "does the sign flip?" check of every inequality skill (dividing by a
//      negative flips it).
//   2. A negative number on the other side: an absolute value is a distance,
//      never negative - so "< -2" has no solution and "> -2" is every number.
//   3. Absolute value is distance from 0, so it splits into two inequalities:
//        |x - 3| < 5  ->  x - 3 < 5  and  x - 3 > -5   (less than 5 away)
//        |x - 3| > 5  ->  x - 3 > 5  or   x - 3 < -5   (more than 5 away)
//   4. Each is solved like any other inequality - the first all the way,
//      then the second - side by side with "and"/"or" staying in place, and
//      the answer graphed (the same layout as Compound Inequalities).

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import { flipSymbol, isInclusive, symbolDirection, type ComparisonSymbol } from "./inequalityCore";
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
  flipCheck,
} from "./compoundInequalities";

export interface AbsIneqProblem {
  a: number; // a·|m x + n| + b  sym  c
  b: number;
  m: number;
  n: number;
  sym: ComparisonSymbol;
  c: number;
}

const plainTerm = (c: number, x: string) => (c === 1 ? x : c === -1 ? `-${x}` : `${c}${x}`);
const innerText = (m: number, n: number, x: string) => `${plainTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;
const innerTex = (m: number, n: number, x: string) => `${renderMultiplyTerm(m, x)}${n === 0 ? "" : ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`}`;
const ps = (s: ComparisonSymbol) => (s === "\\leq" ? "≤" : s === "\\geq" ? "≥" : s);
const isLess = (s: ComparisonSymbol) => symbolDirection(s) === "left";

// |mx + n| sym k, once the absolute value is by itself
export function absIneqAfter(p: AbsIneqProblem): { k: number; sym: ComparisonSymbol } {
  return { k: (p.c - p.b) / p.a, sym: p.a < 0 ? flipSymbol(p.sym) : p.sym };
}

export function buildAbsIneqInstance(p: AbsIneqProblem, x: string = "x"): SolverInstance {
  const { a, b, m, n, c } = p;
  const { k, sym: s } = absIneqAfter(p);
  const absTex = `|${innerTex(m, n, x)}|`;
  const absText = `|${innerText(m, n, x)}|`;
  const e = 4;
  // a line in the left inequality's columns (term, constant, sign, value),
  // with "and"/"or" not shown yet
  const line = (term: string, cst: string, val: string, sym: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: [term, cst, sym, val, BLANK, BLANK, BLANK, BLANK, BLANK],
    spanNext: [0],
    noWidthCols: [0, 3],
    ...(highlight ? { highlight } : {}),
  });
  const notes = (cst: string, val: string): GridRow => ({ cells: [BLANK, cst, BLANK, val, "", BLANK, BLANK, BLANK, BLANK] });

  const initialRow: GridRow = {
    cells: [renderMultiplyTerm(a, absTex), b === 0 ? BLANK : renderConstant(b, true), REL(p.sym), `${c}`, BLANK, BLANK, BLANK, BLANK, BLANK],
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
    steps.push(
      flipCheck("abs_flip_check_constant", "abs_simplified", line(BLANK, BLANK, BLANK, REL(p.sym)), false, "", false,
        "Adding or subtracting the same value from both sides never flips an inequality.")
    );
    const cs = cancelStep(b, [
      { slotId: "__initial__", row: { ...initialRow, cells: initialRow.cells.map((x2, i) => (i === 1 ? `MARKEDTERM:${x2}` : x2)) } },
      { slotId: "abs_annotation", row: notes(`MARKEDTERM:${cTex}`, cTex) },
    ]);
    cs.stepId = "abs_cancel_constant";
    steps.push(cs);
    const cp = combinePrompt(c, b);
    steps.push({
      stepId: "abs_combine_constant",
      rowUpdates: [{ slotId: "abs_simplified", row: line(renderMultiplyTerm(a, absTex), BLANK, `${c - b}`, REL(p.sym)) }],
      prompt: cp.prompt,
      choices: cp.choices,
      explanationOnCorrect: `The terms combine to ${c - b}. The rest of the inequality gets brought down unchanged.`,
    });
    curSlot = "abs_simplified";
  }
  if (a !== 1) {
    const flat = c - b;
    const divSlot = curSlot; // divided in place, under the line it's on
    const willFlip = a < 0;
    const divLine = (marked: boolean) =>
      line(marked ? `MARKEDFRACTION:${a}\u0006${absTex}\u0005${a}` : `\\dfrac{${renderMultiplyTerm(a, absTex)}}{${a}}`, BLANK, `\\dfrac{${flat}}{${a}}`, REL(p.sym));
    const divRow = (marked: boolean): GridRow => (divSlot === "__initial__" ? { ...divLine(marked), spanNext: initialRow.spanNext } : divLine(marked));
    steps.push({
      stepId: "abs_eliminate_coefficient",
      rowUpdates: [{ slotId: divSlot, row: divRow(false) }],
      prompt: `${b === 0 ? "First, get the absolute value by itself. " : ""}What undoes multiplying ${absText} by ${a}?`,
      choices: divideChoices(a, "both sides", b),
      explanationOnCorrect: `The ${a} cancels when we divide both sides by ${a}.`,
    });
    steps.push(
      flipCheck("abs_flip_check_coefficient", "abs_isolated", line(BLANK, BLANK, BLANK, REL(s)), willFlip, `dividing both sides by ${a}`, false,
        willFlip
          ? `Multiplying or dividing both sides by a negative number (${a}) flips the inequality sign.`
          : `${a} is positive, so dividing both sides by it does not flip the inequality sign.`)
    );
    const co = coefficientOneStep(a, [
      { slotId: divSlot, row: divRow(true) },
      { slotId: "abs_isolated", row: line(absTex, BLANK, BLANK, REL(s)) },
    ]);
    co.stepId = "abs_confirm_coefficient_one";
    co.explanationOnCorrect = `The ${a} divided by itself is 1, so the absolute value is by itself.`;
    steps.push(co);
    steps.push(computeStep("abs_compute_value", flat, a, [{ slotId: "abs_isolated", row: line(absTex, BLANK, `${k}`, REL(s)) }]));
  }
  const done = (): SolverInstance => ({ initialRow, steps, eqColumnIndex: e, columnCount: 9, termAlign: "right", alignColumns: true });

  // ---------- 2. a negative number: no solution, or every number ----------
  if (k < 0) {
    const less = isLess(s);
    steps.push({
      stepId: less ? "abs_no_solution" : "abs_all_real_numbers",
      rowUpdates: [{ slotId: "abs_answer", row: { cells: [], caption: less ? "No solution" : "All real numbers", highlight: "success" } }],
      prompt: less ? `Can an absolute value be ${s === "<" ? "less than" : "less than or equal to"} ${k}?` : `Which numbers make ${absText} ${ps(s)} ${k} true?`,
      choices: less
        ? shuffle<Choice>([
            { text: "No - an absolute value is a distance, so it's never negative", isCorrect: true, misconceptionTag: null },
            { text: `Yes, when ${innerText(m, n, x)} ${ps(s)} ${k}`, isCorrect: false, misconceptionTag: "thinks_absolute_value_can_be_negative" },
            { text: `Yes, when ${innerText(m, n, x)} ${ps(s)} ${-k}`, isCorrect: false, misconceptionTag: "drops_the_sign" },
          ])
        : shuffle<Choice>([
            { text: "Every number - an absolute value is never negative, so it's always bigger", isCorrect: true, misconceptionTag: null },
            { text: "No numbers - an absolute value can't be negative", isCorrect: false, misconceptionTag: "confuses_no_solution_with_all_reals" },
            { text: `Only when ${innerText(m, n, x)} ${ps(s)} ${-k}`, isCorrect: false, misconceptionTag: "drops_the_sign" },
          ]),
      explanationOnCorrect: less
        ? `Absolute value is distance from 0, and a distance is never negative. So ${absText} is never ${s === "<" ? "less than" : "less than or equal to"} ${k}: there's no solution.`
        : `Absolute value is distance from 0, so it's always 0 or more - always bigger than ${k}. Every number works: all real numbers.`,
    });
    return done();
  }

  // ---------- 3. split into two inequalities ----------
  const join: "and" | "or" = isLess(s) ? "and" : "or";
  const s2 = flipSymbol(s);
  const split: GridRow = {
    cells: [renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(s), `${k}`, JOIN(join), renderMultiplyTerm(m, x), n === 0 ? BLANK : renderConstant(n, true), REL(s2), `${-k}`],
  };
  const inner = innerText(m, n, x);
  const answer = `${inner} ${ps(s)} ${k} ${join} ${inner} ${ps(s2)} ${-k}`;
  const other = join === "and" ? "or" : "and";
  const away = isInclusive(s) ? (join === "and" ? "at most" : "at least") : join === "and" ? "less than" : "more than";
  steps.push({
    stepId: "abs_split",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `Absolute value is the distance from 0. Which two inequalities does ${absText} ${ps(s)} ${k} make?`,
    choices: withCorrect(answer, dedup(answer, [
      { text: `${inner} ${ps(s)} ${k} ${join} ${inner} ${ps(s)} ${-k}`, tag: "forgot_to_flip_second_case" },
      { text: `${inner} ${ps(s)} ${k} ${other} ${inner} ${ps(s2)} ${-k}`, tag: "confuses_and_with_or" },
      { text: `${inner} ${ps(s)} ${k} only`, tag: "forgot_negative_case" },
    ], 3)),
    explanationOnCorrect:
      join === "and"
        ? `${absText} ${ps(s)} ${k} means ${inner} is ${away} ${k} away from 0 - between ${-k} and ${k}. So ${inner} ${ps(s)} ${k} and ${inner} ${ps(s2)} ${-k}, and both have to be true.`
        : `${absText} ${ps(s)} ${k} means ${inner} is ${away} ${k} away from 0 - past ${k}, or past ${-k} the other way. So ${inner} ${ps(s)} ${k} or ${inner} ${ps(s2)} ${-k}.`,
  });

  // ---------- 4. solve both, then graph ----------
  return buildTwoPart(
    { kind: "twoPart", join, p1: { a: m, b: n, sym: s, rhs: k }, p2: { a: m, b: n, sym: s2, rhs: -k } },
    x,
    { lead: { initialRow, steps, startSlot: "split" } }
  );
}

// ---------- practice problems ----------
const SYMS: ComparisonSymbol[] = ["<", "\\leq", ">", "\\geq"];
export function generateAbsIneqProblem(): AbsIneqProblem {
  for (;;) {
    const m = Math.random() < 0.5 ? 1 : randInt(2, 4) * (Math.random() < 0.15 ? -1 : 1);
    const n = Math.random() < 0.15 ? 0 : randInt(1, 9) * (randBool() ? 1 : -1);
    const negative = Math.random() < 0.08;
    const k = negative ? -randInt(1, 9) : randInt(1, 12);
    if (!negative && ((k - n) % m !== 0 || (-k - n) % m !== 0)) continue;
    if (n === 0 && m === 1 && Math.random() < 0.5) continue; // fewer |x| < k
    const s = SYMS[randInt(0, 3)];
    if (Math.random() < 0.35) {
      const a = Math.random() < 0.3 ? 1 : randInt(2, 4) * (Math.random() < 0.2 ? -1 : 1);
      const b = Math.random() < 0.3 ? 0 : randInt(1, 9) * (randBool() ? 1 : -1);
      if (a === 1 && b === 0) continue;
      // the problem as written: dividing by a negative flips it back to s
      return { a, b, m, n, sym: a < 0 ? flipSymbol(s) : s, c: a * k + b };
    }
    return { a: 1, b: 0, m, n, sym: s, c: k };
  }
}

export function generateAbsIneqInstance(): SolverInstance {
  return buildAbsIneqInstance(generateAbsIneqProblem());
}
