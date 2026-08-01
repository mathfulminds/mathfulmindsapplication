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
  renderFractionTerm,
  renderReciprocal,
  shuffle,
  signedWord,
} from "./isolateVariableCore";

interface FractionEquationInstance {
  n: number; // numerator (signed - carries the coefficient's sign)
  d: number; // denominator (always positive)
  b: number; // constant term
  variableFirst: boolean;
  orientation: Orientation;
  rhs: number;
  solution: number;
}

export function generateFractionEquation(): FractionEquationInstance {
  const d = randInt(2, 6);
  // numerator: nonzero, not equal to d (avoid a coefficient of "1"),
  // proper fraction (|n| < d) so this stays recognizably a fraction skill
  let n = randInt(1, d - 1) * randSign();
  while (n === 0) n = randInt(1, d - 1) * randSign();

  const b = randInt(1, 20) * randSign();

  // Pick k first, then x = d * k, so (n/d) * x = n * k is always a clean
  // integer - same "pick the clean multiple first" trick used for the
  // division-notation case last session.
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = d * k;
  const rhs = n * k + b;
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";

  return { n, d, b, variableFirst: randBool(), orientation, rhs, solution: x };
}

export function buildFractionSolverInstance(
  eq: FractionEquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { n, d, b, variableFirst, orientation, rhs, solution } = eq;

  const variableTermNatural = renderFractionTerm(n, d, variableSymbol);
  const variableTermForced = renderFractionTerm(n, d, variableSymbol, true);
  const constantBNatural = renderConstant(b);
  const constantBForced = renderConstant(b, true);

  const exprTerm1 = variableFirst ? variableTermNatural : constantBNatural;
  const exprTerm2 = variableFirst ? constantBForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation),
  };

  // Step 1: eliminate the constant term - identical pattern to every
  // other skill built on this core.
  const cancelValue = -b;
  const cancelDisplay = renderConstant(cancelValue, true);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };

  const simplifiedRhs = rhs - b; // = n * k, by construction

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(simplifiedRhs), orientation),
  };

  // Step 2: multiply both sides by the reciprocal - the genuinely new
  // technique this skill is built around. Same "outer edge, away from
  // the equals sign" placement rule established for divide-notation.
  const reciprocal = renderReciprocal(n, d);
  const exprIsLeftOfEquals = orientation === "expressionLeft";
  const constantIsLeftOfEquals = orientation === "expressionRight";

  const multipliedVarTerm = exprIsLeftOfEquals
    ? `(${reciprocal})${renderFractionTerm(n, d, variableSymbol)}`
    : `${renderFractionTerm(n, d, variableSymbol)}(${reciprocal})`;
  const multipliedConstant = constantIsLeftOfEquals
    ? `(${reciprocal})(${simplifiedRhs})`
    : `(${simplifiedRhs})(${reciprocal})`;

  const reciprocalExpr1 = bIsSecond ? multipliedVarTerm : BLANK;
  const reciprocalExpr2 = bIsSecond ? BLANK : multipliedVarTerm;
  const reciprocalRow: GridRow = {
    cells: assembleRow(reciprocalExpr1, reciprocalExpr2, multipliedConstant, orientation),
  };

  // Step 3: final answer.
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(solution), orientation),
    highlight: "success",
  };

  // ---- Step A choices ----
  const constantIsPositive = b >= 0;
  const stepAChoices: Choice[] = [
    {
      text: constantIsPositive
        ? `Subtracting ${Math.abs(b)} from both sides`
        : `Adding ${Math.abs(b)} to both sides`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `${constantIsPositive ? "Divide" : "Multiply"} both sides by ${Math.abs(b)}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
    {
      text: constantIsPositive
        ? `Adding ${Math.abs(b)} to both sides`
        : `Subtracting ${Math.abs(b)} from both sides`,
      isCorrect: false,
      misconceptionTag: "flipped_the_operation",
    },
  ];

  const stepA: SolverStep = {
    stepId: "eliminate_constant",
    rowUpdates: [
      { slotId: "cancel_annotation", row: cancelRow },
      { slotId: "simplified", row: combinedRow },
    ],
    prompt: `What undoes the ${signedWord(b)} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: constantIsPositive
      ? `Undo addition by subtracting ${Math.abs(b)} from both sides.`
      : `Undo subtraction by adding ${Math.abs(b)} to both sides.`,
  };

  // ---- Step B choices: the reciprocal technique itself ----
  // Wrapped in $...$ so StepSolver renders these as real KaTeX fractions
  // even though they're sitting inside otherwise-plain prompt/choice text.
  const reciprocalKatex = `$${reciprocal}$`;
  const coefficientKatex = `$${renderFractionTerm(n, d, "")}$`;
  const wrongSameFraction = `$${renderFractionTerm(n, d, "")}$`;
  const stepBChoices: Choice[] = [
    {
      text: `Multiplying both sides by ${reciprocalKatex}`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `Multiplying both sides by ${wrongSameFraction}`,
      isCorrect: false,
      misconceptionTag: "forgot_to_flip_reciprocal",
    },
    {
      text: `Dividing both sides by ${reciprocalKatex}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
  ];

  const stepB: SolverStep = {
    stepId: "multiply_by_reciprocal",
    rowUpdates: [{ slotId: "simplified", row: reciprocalRow }],
    prompt: `What operation isolates ${variableSymbol} when its coefficient is ${coefficientKatex}?`,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: `Multiplying both sides by the reciprocal, ${reciprocalKatex}, since a fraction times its reciprocal equals 1.`,
  };

  // ---- Step C: compute the final value ----
  const stepCChoices: Choice[] = [
    { text: `${variableSymbol} = ${solution}`, isCorrect: true, misconceptionTag: null },
    {
      text: `${variableSymbol} = ${-solution}`,
      isCorrect: false,
      misconceptionTag: "sign_error",
    },
    {
      text: `${variableSymbol} = ${simplifiedRhs}`,
      isCorrect: false,
      misconceptionTag: "forgot_final_operation",
    },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `${simplifiedRhs} \u00d7 ${reciprocalKatex} = ? What is the value of ${variableSymbol}?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: `${simplifiedRhs} \u00d7 ${reciprocalKatex} = ${solution}.`,
  };

  return {
    initialRow,
    steps: [stepA, stepB, stepC],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateFractionInstance(): SolverInstance {
  const eq = generateFractionEquation();
  return buildFractionSolverInstance(eq);
}
