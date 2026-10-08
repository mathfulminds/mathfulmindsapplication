import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
  BLANK,
  Orientation,
  assembleRow,
  eqColumnIndexFor,
  randBool,
  randInt,
  randSign,
  renderConstant,
  renderMultiplyTerm,
  shuffle,
} from "./isolateVariableCore";
import { buildSolverInstance as buildTwoStepInstance } from "./twoStepEquations";

// m(nx + p) = q. Once distributed this is exactly the shape
// twoStepEquations.ts already solves (coefficient m*n, constant m*p,
// rhs q) - so this skill only needs to own the two distribute steps and
// the pre-distribution display; everything after that is the existing
// two-step engine, called directly rather than re-implemented.
//
// The variable term always comes first inside the parentheses (m(nx+p),
// never m(p+nx)) - fixed rather than randomized, specifically so the
// pre-distribution row's two columns line up with the same two columns
// the distributed terms land in later.
//
// IMPORTANT: plain "(" and ")" are used here, not KaTeX's \left( \right).
// \left/\right must be matched within a SINGLE KaTeX expression - since
// the open and close parens live in two separately-rendered grid cells,
// using \left(/\right) here would make each cell individually invalid
// LaTeX (an unmatched delimiter), which is exactly the red parse-error
// text from the earlier version of this file. Plain "(" / ")" are just
// ordinary characters with no pairing requirement, so they render fine
// split across cells - the only cost is they don't auto-size to tall
// content, which doesn't matter for these short expressions.
interface ParenInstance {
  m: number;
  n: number;
  p: number;
  q: number;
  orientation: Orientation;
  solution: number;
}

export function generateParenEquation(): ParenInstance {
  const m = randInt(2, 9) * randSign();
  let n = randInt(1, 4) * randSign();
  while (n === 0) n = randInt(1, 4) * randSign();
  const p = randInt(1, 12) * randSign();

  let x = randInt(-10, 10);
  while (x === 0) x = randInt(-10, 10);
  const q = m * (n * x + p);

  return {
    m,
    n,
    p,
    q,
    orientation: randBool() ? "expressionLeft" : "expressionRight",
    solution: x,
  };
}


// The correct answer plus two different wrong ones (some wrong answers
// coincide for small numbers, e.g. a multiplier of -1).
function uniqueChoices(correct: string, wrong: { text: string; tag: string }[]): Choice[] {
  const seen = new Set([correct]);
  const out: Choice[] = [{ text: correct, isCorrect: true, misconceptionTag: null }];
  for (const w of wrong) {
    if (out.length === 3) break;
    if (seen.has(w.text)) continue;
    seen.add(w.text);
    out.push({ text: w.text, isCorrect: false, misconceptionTag: w.tag });
  }
  return out;
}

export function buildParenSolverInstance(
  eq: ParenInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { m, n, p, q, orientation, solution } = eq;

  const nxNatural = renderMultiplyTerm(n, variableSymbol);
  const pSigned = renderConstant(p, true);
  // A lone minus sign in front of the parentheses, -(nx + p), is a
  // multiplier of -1 (used by the distributing-a-negative skill).
  const coefDisplay = m === -1 ? "-" : `${m}`;
  const minusOneNote = m === -1 ? "A minus sign in front of parentheses means multiply by -1. " : "";
  const term1ColOriginal = `${coefDisplay}(${nxNatural}`;
  const term2ColOriginal = `${pSigned})`;

  const initialRow: GridRow = {
    cells: assembleRow(term1ColOriginal, term2ColOriginal, renderConstant(q), orientation, "="),
  };

  const mn = m * n;
  const mp = m * p;
  const mnxNatural = renderMultiplyTerm(mn, variableSymbol);
  const mpSigned = renderConstant(mp, true);

  // Delegate everything after distribution to the existing two-step
  // engine (variableFirst is always true here - see note above).
  // "distributed" is passed as the initial-slot override, since that's
  // the slot THIS file's own distribute steps put the post-distribution
  // equation into - not "__initial__", which stays on the pre-
  // distribution row here.
  const twoStep = buildTwoStepInstance(
    {
      a: mn,
      b: mp,
      form: "multiply",
      variableFirst: true,
      orientation,
      rhs: q,
      solution,
    },
    variableSymbol,
    "distributed"
  );

  // --- Sub-step 1: distribute into the first (variable) term ---
  // Only the distributed term appears here - everything else (the still-
  // undistributed second term, the equals sign, and the rhs) stays
  // blank until distribute_second_term reveals the complete line at
  // once. The arc diagram itself is unaffected by this - it's driven
  // separately by arcsShown, which still progresses 0 -> 1 -> 2 as
  // normal.
  const rowAfterFirstTerm: GridRow = {
    cells: assembleRow(mnxNatural, BLANK, BLANK, orientation, ""),
  };

  const step1Choices: Choice[] = shuffle(
    uniqueChoices(`$${mnxNatural}$`, [
      { text: `$${renderMultiplyTerm(-mn, variableSymbol)}$`, tag: "sign_error" },
      { text: `$${nxNatural}$`, tag: "forgot_outside_coefficient" },
      { text: `$${renderMultiplyTerm(mn * 2, variableSymbol)}$`, tag: "arithmetic_slip" },
    ])
  );

  const distributeFirstTerm: SolverStep = {
    stepId: "distribute_first_term",
    rowUpdates: [{ slotId: "distributed", row: rowAfterFirstTerm }],
    prompt: `${minusOneNote}What is $${m} \\times ${nxNatural}$?`,
    choices: step1Choices,
    explanationOnCorrect: `$${m} \\times ${nxNatural} = ${mnxNatural}$.`,
    distributeVisual: { coefficient: coefDisplay, term1: nxNatural, term2: pSigned },
  };

  // --- Sub-step 2: distribute into the second (constant) term ---
  const step2Choices: Choice[] = shuffle(
    uniqueChoices(`$${mpSigned}$`, [
      { text: `$${renderConstant(-mp, true)}$`, tag: "sign_error" },
      { text: `$${pSigned}$`, tag: "forgot_to_distribute_second_term" },
      { text: `$${renderConstant(mp - 1, true)}$`, tag: "arithmetic_slip" },
    ])
  );

  const distributeSecondTerm: SolverStep = {
    stepId: "distribute_second_term",
    rowUpdates: [{ slotId: "distributed", row: twoStep.initialRow }],
    prompt: `What is $${m} \\times ${p}$?`,
    choices: step2Choices,
    explanationOnCorrect: `$${m} \\times ${p} = ${mp}$.${m === -1 ? " The rest of the equation gets brought down unchanged." : ""}`,
    distributeVisual: { coefficient: coefDisplay, term1: nxNatural, term2: pSigned },
  };

  return {
    initialRow,
    steps: [distributeFirstTerm, distributeSecondTerm, ...twoStep.steps],
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateParenthesesEquationInstance(): SolverInstance {
  const eq = generateParenEquation();
  return buildParenSolverInstance(eq);
}
