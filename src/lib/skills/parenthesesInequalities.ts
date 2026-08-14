import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
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
import { ComparisonSymbol, randomSymbol } from "./inequalityCore";
import { buildSolverInstance as buildTwoStepInequalityInstance } from "./twoStepInequalities";

// m(nx + p) [sym] q. Same structure as parenthesesEquations.ts: two
// distribute sub-steps, then delegate to the existing two-step inequality
// engine (which owns its own sign-flip gates for the steps that follow -
// distribution itself never flips the symbol, since it rewrites one side
// rather than operating on both). variableFirst is fixed true for the
// same alignment reason as the equation version.
//
// Plain "(" and ")" are used rather than KaTeX's \left( \right) - see the
// comment in parenthesesEquations.ts for why splitting \left/\right
// across two separately-rendered cells produces invalid LaTeX per cell.
interface ParenInequalityInstance {
  m: number;
  n: number;
  p: number;
  q: number;
  orientation: Orientation;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

export function generateParenInequality(): ParenInequalityInstance {
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
    boundary: x,
    origSymbol: randomSymbol(randInt),
  };
}

export function buildParenInequalitySolverInstance(
  ineq: ParenInequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { m, n, p, q, orientation, boundary, origSymbol } = ineq;

  const nxNatural = renderMultiplyTerm(n, variableSymbol);
  const pSigned = renderConstant(p, true);
  const term1ColOriginal = `${m}(${nxNatural}`;
  const term2ColOriginal = `${pSigned})`;

  const initialRow: GridRow = {
    cells: assembleRow(term1ColOriginal, term2ColOriginal, renderConstant(q), orientation, origSymbol),
  };

  const mn = m * n;
  const mp = m * p;
  const mnxNatural = renderMultiplyTerm(mn, variableSymbol);
  const mpSigned = renderConstant(mp, true);

  const twoStep = buildTwoStepInequalityInstance({
    a: mn,
    b: mp,
    form: "multiply",
    variableFirst: true,
    orientation,
    rhs: q,
    boundary,
    origSymbol,
  });

  const rowAfterFirstTerm: GridRow = {
    cells: assembleRow(mnxNatural, term2ColOriginal, renderConstant(q), orientation, origSymbol),
  };

  const step1Choices: Choice[] = shuffle([
    { text: `$${mnxNatural}$`, isCorrect: true, misconceptionTag: null },
    { text: `$${renderMultiplyTerm(-mn, variableSymbol)}$`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `$${nxNatural}$`, isCorrect: false, misconceptionTag: "forgot_outside_coefficient" },
  ]);

  const distributeFirstTerm: SolverStep = {
    stepId: "distribute_first_term",
    rowUpdates: [{ slotId: "distributed", row: rowAfterFirstTerm }],
    prompt: `What is $${m} \\times ${nxNatural}$?`,
    choices: step1Choices,
    explanationOnCorrect: `$${m} \\times ${nxNatural} = ${mnxNatural}$. Distributing never flips the inequality sign.`,
    distributeVisual: { coefficient: `${m}`, term1: nxNatural, term2: pSigned },
  };

  const step2Choices: Choice[] = shuffle([
    { text: `$${mpSigned}$`, isCorrect: true, misconceptionTag: null },
    { text: `$${renderConstant(-mp, true)}$`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `$${pSigned}$`, isCorrect: false, misconceptionTag: "forgot_to_distribute_second_term" },
  ]);

  const distributeSecondTerm: SolverStep = {
    stepId: "distribute_second_term",
    rowUpdates: [{ slotId: "distributed", row: twoStep.initialRow }],
    prompt: `What is $${m} \\times ${p}$?`,
    choices: step2Choices,
    explanationOnCorrect: `$${m} \\times ${p} = ${mp}$. Distributing never flips the inequality sign.`,
    distributeVisual: { coefficient: `${m}`, term1: nxNatural, term2: pSigned },
  };

  return {
    initialRow,
    steps: [distributeFirstTerm, distributeSecondTerm, ...twoStep.steps],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateParenthesesInequalityInstance(): SolverInstance {
  const ineq = generateParenInequality();
  return buildParenInequalitySolverInstance(ineq);
}
