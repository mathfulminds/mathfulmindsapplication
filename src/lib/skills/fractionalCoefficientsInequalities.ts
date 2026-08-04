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
import {
  ComparisonSymbol,
  flipSymbol,
  graphChoiceText,
  isInclusive,
  plainSymbol,
  randomSymbol,
  symbolDirection,
  symbolFromDirectionInclusive,
} from "./inequalityCore";

interface FractionInequalityInstance {
  n: number; // numerator (signed - carries the coefficient's sign)
  d: number; // denominator (always positive)
  b: number; // constant term
  variableFirst: boolean;
  orientation: Orientation;
  rhs: number;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

// Same generation shape as generateFractionEquation() in
// fractionalCoefficients.ts - n was already signed there (it has to be,
// there's no "always positive" version of a fractional coefficient the
// way two-step equations had for the divide form), so no change was
// needed to get real coverage of both flip and no-flip cases.
export function generateFractionInequality(): FractionInequalityInstance {
  const d = randInt(2, 6);
  let n = randInt(1, d - 1) * randSign();
  while (n === 0) n = randInt(1, d - 1) * randSign();

  const b = randInt(1, 20) * randSign();

  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = d * k;
  const rhs = n * k + b;
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const origSymbol = randomSymbol(randInt);

  return { n, d, b, variableFirst: randBool(), orientation, rhs, boundary: x, origSymbol };
}

export function buildFractionSolverInstance(
  ineq: FractionInequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { n, d, b, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;

  const variableTermNatural = renderFractionTerm(n, d, variableSymbol);
  const variableTermForced = renderFractionTerm(n, d, variableSymbol, true);
  const constantBNatural = renderConstant(b);
  const constantBForced = renderConstant(b, true);

  const exprTerm1 = variableFirst ? variableTermNatural : constantBNatural;
  const exprTerm2 = variableFirst ? constantBForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation, origSymbol),
  };

  // --- Step A: eliminate the constant (never flips) ---
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
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(simplifiedRhs), orientation, origSymbol),
  };

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

  const stepAFlip: SolverStep = {
    stepId: "sign_flip_check_constant",
    rowUpdates: [],
    prompt: "Does the inequality sign flip here?",
    choices: shuffle([
      { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
    ]),
    explanationOnCorrect:
      "Adding or subtracting the same value from both sides never flips an inequality - only multiplying by a negative number does.",
  };

  // --- Step B: multiply by the reciprocal (flips iff the reciprocal is negative, i.e. iff n < 0) ---
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
    cells: assembleRow(reciprocalExpr1, reciprocalExpr2, multipliedConstant, orientation, origSymbol),
  };

  const reciprocalKatex = `$${reciprocal}$`;
  const coefficientKatex = `$${renderFractionTerm(n, d, "")}$`;
  const stepBChoices: Choice[] = [
    {
      text: `Multiplying both sides by ${reciprocalKatex}`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `Multiplying both sides by $${renderFractionTerm(n, d, "")}$`,
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

  const willFlip = n < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    rowUpdates: [],
    prompt: `Does the inequality sign flip here? (multiplying both sides by ${reciprocalKatex})`,
    choices: shuffle([
      {
        text: willFlip ? "Yes, the sign flips" : "No, the sign stays the same",
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: willFlip ? "No, the sign stays the same" : "Yes, the sign flips",
        isCorrect: false,
        misconceptionTag: willFlip ? "forgot_to_flip_sign" : "flipped_when_not_needed",
      },
    ]),
    explanationOnCorrect: willFlip
      ? `The reciprocal, ${reciprocalKatex}, is negative, so multiplying both sides by it flips the inequality sign.`
      : `The reciprocal, ${reciprocalKatex}, is positive, so multiplying both sides by it does not flip the inequality sign.`,
  };

  // --- Step C: compute the resulting value ---
  const needsCanonicalize = orientation === "expressionRight";
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(boundary), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const stepCChoices: Choice[] = [
    { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
    { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `${simplifiedRhs}`, isCorrect: false, misconceptionTag: "forgot_final_operation" },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `${simplifiedRhs} \u00d7 ${reciprocalKatex} = ? What number completes the inequality?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: `${simplifiedRhs} \u00d7 ${reciprocalKatex} = ${boundary}.`,
  };

  const steps: SolverStep[] = [stepA, stepAFlip, stepB, stepBFlip, stepC];

  // --- Step D (conditional): canonicalize so the variable reads first ---
  let canonicalSymbol = afterMultSymbol;
  if (needsCanonicalize) {
    canonicalSymbol = flipSymbol(afterMultSymbol);
    const canonicalRow: GridRow = {
      cells: assembleRow(renderConstant(boundary), BLANK, variableSymbol, orientation, canonicalSymbol),
      highlight: "success",
    };

    steps.push({
      stepId: "canonicalize_orientation",
      rowUpdates: [{ slotId: "final", row: canonicalRow }],
      prompt: `We want ${variableSymbol} written first. Does the inequality symbol flip when you swap which side ${variableSymbol} is on?`,
      choices: shuffle([
        {
          text: "Yes - the symbol flips when you swap sides",
          isCorrect: true,
          misconceptionTag: null,
        },
        {
          text: "No - the symbol stays the same",
          isCorrect: false,
          misconceptionTag: "forgot_symbol_flips_on_side_swap",
        },
      ]),
      explanationOnCorrect: `Swapping which side each quantity sits on flips the symbol: ${boundary} ${plainSymbol(
        afterMultSymbol
      )} ${variableSymbol} becomes ${variableSymbol} ${plainSymbol(canonicalSymbol)} ${boundary}.`,
    });
  }

  // --- Final step: graph the solution on a number line ---
  const dir = symbolDirection(canonicalSymbol);
  const inc = isInclusive(canonicalSymbol);
  const otherDir = dir === "left" ? "right" : "left";

  steps.push({
    stepId: "graph_solution",
    rowUpdates: [],
    prompt: `Which number line shows ${variableSymbol} ${plainSymbol(canonicalSymbol)} ${boundary}?`,
    choices: shuffle([
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, inc)),
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_boundary",
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_direction",
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_graph",
      },
    ]),
    explanationOnCorrect: `${inc ? "A closed" : "An open"} circle at ${boundary}, shaded to the ${dir}, matches ${variableSymbol} ${plainSymbol(
      canonicalSymbol
    )} ${boundary}.`,
  });

  return {
    initialRow,
    steps,
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateFractionalCoefficientsInequalityInstance(): SolverInstance {
  const ineq = generateFractionInequality();
  return buildFractionSolverInstance(ineq);
}
