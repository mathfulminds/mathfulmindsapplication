// Distributing a negative. Two kinds of problem:
//
//   -(x + 3) = 9          a lone minus sign in front of parentheses means
//                         multiply by -1 (handled by the parentheses
//                         skill's builder, which now accepts m = -1)
//
//   5 - 3(x + 2) = 20     the minus sign belongs to the 3, so -3 is
//                         distributed:
//                           5 - 3x - 6 = 20     (arrows from -3, as usual)
//                          -1 - 3x     = 20     (combine 5 - 6)
//                         ...then the usual two-step solve.
//
// The second kind needs three term columns (5 | -3x | -6), so its rows
// have 5 cells. Everything after the constants are combined comes from
// the two-step builder, with each of its 4-cell rows widened to 5 cells
// (an empty third column), so the solving steps look exactly like every
// other skill's.

import type { SolverInstance, SolverStep, Choice, GridRow, PairedGridRow } from "./types";
import { BLANK, Orientation, SIGN_GAP, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import { buildSolverInstance as buildTwoStepInstance } from "./twoStepEquations";
import { buildParenSolverInstance } from "./parenthesesEquations";

export interface SubtractGroupProblem {
  k: number; // the constant in front: k - m(nx + p)
  m: number; // the (positive) number being subtracted; 1 means "k - (nx + p)"
  n: number;
  p: number;
  q: number;
  orientation: Orientation;
}

export type DistributeNegativeProblem =
  | ({ kind: "minusOne" } & { n: number; p: number; q: number; orientation: Orientation })
  | ({ kind: "subtractGroup" } & SubtractGroupProblem);

function nonZero(min: number, max: number): number {
  let v = randInt(min, max);
  while (v === 0) v = randInt(min, max);
  return v;
}

export function generateDistributeNegative(): DistributeNegativeProblem {
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  if (Math.random() < 0.4) {
    // -(nx + p) = q
    const n = randInt(1, 4);
    const p = nonZero(-9, 9);
    const x = nonZero(-10, 10);
    return { kind: "minusOne", n, p, q: -(n * x + p), orientation };
  }
  for (;;) {
    const m = Math.random() < 0.4 ? 1 : randInt(2, 6);
    const n = randInt(1, 4);
    const p = nonZero(-9, 9);
    const k = Math.random() < 0.8 ? randInt(1, 15) : -randInt(1, 15);
    const x = nonZero(-10, 10);
    if (k - m * p === 0) continue; // the constants would cancel completely
    return { kind: "subtractGroup", k, m, n, p, q: k - m * (n * x + p), orientation };
  }
}

// ---------- k - m(nx + p) = q ----------

function assemble5(c0: string, c1: string, c2: string, rhs: string, orientation: Orientation, eq = "="): string[] {
  return orientation === "expressionLeft" ? [c0, c1, c2, eq, rhs] : [rhs, eq, c0, c1, c2];
}

// A two-step row [const, var, "=", rhs] (or mirrored) widened to 5 cells.
function widen(row: GridRow | PairedGridRow, orientation: Orientation): GridRow {
  const r = row as GridRow;
  const c = [...r.cells];
  const cells = orientation === "expressionLeft" ? [c[0], c[1], BLANK, c[2], c[3]] : [c[0], c[1], c[2], c[3], BLANK];
  return { ...r, cells };
}

function uniqueChoices(correct: string, wrong: { text: string; tag: string }[]): Choice[] {
  const seen = new Set([correct]);
  const out: Choice[] = [{ text: correct, isCorrect: true, misconceptionTag: null }];
  for (const w of wrong) {
    if (out.length === 3) break;
    if (seen.has(w.text)) continue;
    seen.add(w.text);
    out.push({ text: w.text, isCorrect: false, misconceptionTag: w.tag });
  }
  return shuffle(out);
}

export function buildSubtractGroupInstance(prob: SubtractGroupProblem, v: string = "x"): SolverInstance {
  const { k, m, n, p, q, orientation } = prob;
  const M = -m; // what actually gets distributed
  const Mn = M * n;
  const Mp = M * p;
  const b = k + Mp; // the constants combined
  const solution = (q - b) / Mn;

  const nx = renderMultiplyTerm(n, v);
  const pSigned = renderConstant(p, true);
  // "- 3(" or "- (" - the minus sign is part of the multiplier.
  const coef = m === 1 ? `-${SIGN_GAP}` : `-${SIGN_GAP}${m}`;
  const initialRow: GridRow = { cells: assemble5(`${k}`, `${coef}(${nx}`, `${pSigned})`, `${q}`, orientation) };
  const termCols: [number, number] = orientation === "expressionLeft" ? [1, 2] : [3, 4];
  const distributeVisual = { coefficient: coef, term1: nx, term2: pSigned, termCols };

  const MnxForced = renderMultiplyTerm(Mn, v, true);
  const MnxNatural = renderMultiplyTerm(Mn, v);
  const MpForced = renderConstant(Mp, true);

  const twoStep = buildTwoStepInstance(
    { a: Mn, b, form: "multiply", variableFirst: false, orientation, rhs: q, solution } as Parameters<typeof buildTwoStepInstance>[0],
    v,
    "combined"
  );

  const minusNote = m === 1 ? "A minus sign in front of parentheses means multiply by -1. " : `The minus sign goes with the ${m}, so you distribute -${m}. `;
  const steps: SolverStep[] = [];

  steps.push({
    stepId: "distribute_first_term",
    rowUpdates: [{ slotId: "distributed", row: { cells: assemble5(BLANK, MnxNatural, BLANK, BLANK, orientation, "") } }],
    prompt: `${minusNote}What is $${M} \\times ${nx}$?`,
    choices: uniqueChoices(`$${MnxNatural}$`, [
      { text: `$${renderMultiplyTerm(-Mn, v)}$`, tag: "sign_error" },
      { text: `$${nx}$`, tag: "forgot_outside_coefficient" },
      { text: `$${renderMultiplyTerm(Mn * 2, v)}$`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${M} \\times ${nx} = ${MnxNatural}$.`,
    distributeVisual,
  });

  steps.push({
    stepId: "distribute_second_term",
    rowUpdates: [{ slotId: "distributed", row: { cells: assemble5(`${k}`, MnxForced, MpForced, `${q}`, orientation) } }],
    prompt: `What is $${M} \\times ${p}$?`,
    choices: uniqueChoices(`$${MpForced}$`, [
      { text: `$${renderConstant(-Mp, true)}$`, tag: "sign_error" },
      { text: `$${pSigned}$`, tag: "forgot_to_distribute_second_term" },
      { text: `$${renderConstant(Mp - 1, true)}$`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${M} \\times ${p} = ${Mp}$. The rest of the equation gets brought down unchanged.`,
    distributeVisual,
  });

  const combinePrompt = `${k} ${Mp < 0 ? "-" : "+"} ${Math.abs(Mp)}`;
  steps.push({
    stepId: "combine_constants",
    rowUpdates: [{ slotId: "combined", row: widen(twoStep.initialRow, orientation) }],
    prompt: `Combine the numbers on the same side. What is ${combinePrompt}?`,
    choices: uniqueChoices(`${b}`, [
      { text: `${k - Mp}`, tag: "flipped_the_operation" },
      { text: `${-b}`, tag: "sign_error" },
      { text: `${b + 1}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `${combinePrompt} = ${b}. The $${MnxNatural}$ comes down unchanged.`,
  });

  for (const st of twoStep.steps) {
    steps.push({ ...st, rowUpdates: st.rowUpdates.map((u) => ({ ...u, row: widen(u.row, orientation) })) });
  }

  return {
    initialRow,
    steps,
    eqColumnIndex: orientation === "expressionLeft" ? 3 : 1,
    termAlign: "right",
  };
}

export function buildDistributeNegativeInstance(prob: DistributeNegativeProblem, v: string = "x"): SolverInstance {
  if (prob.kind === "minusOne") {
    const { n, p, q, orientation } = prob;
    const solution = (-q - p) / n;
    return buildParenSolverInstance({ m: -1, n, p, q, orientation, solution }, v);
  }
  return buildSubtractGroupInstance(prob, v);
}

export function generateDistributeNegativeInstance(): SolverInstance {
  return buildDistributeNegativeInstance(generateDistributeNegative());
}
