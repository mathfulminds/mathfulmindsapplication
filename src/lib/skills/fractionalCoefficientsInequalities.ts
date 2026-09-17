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

function dedupNumeric(
  correctText: string,
  candidates: { text: string; tag: string }[]
): { text: string; tag: string }[] {
  const seen = new Set([correctText]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === 2) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

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
  const cancelDisplay = renderConstant(cancelValue, true, false);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };

  const simplifiedRhs = rhs - b; // = n * k, by construction

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  // Symbol-only reveal - sign_flip_check_constant's own row (comes
  // before cancel_constant/combine_constant), showing just the resolved
  // symbol with everything else blank, since neither the isolated
  // variable side nor the combined value are known yet at this point.
  const combinedRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, origSymbol),
  };
  // Full reveal - combine_constant's own row, now filling in both the
  // variable side and the combined value together, since the symbol was
  // already shown by sign_flip_check_constant on this same line.
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(simplifiedRhs), orientation, origSymbol),
  };

  const constantIsPositive = b >= 0;
  const absB = Math.abs(b);
  const constOpSym = constantIsPositive ? "-" : "+";
  const stepAChoices: Choice[] = [
    {
      text: constantIsPositive
        ? `Subtracting ${absB} from both sides`
        : `Adding ${absB} to both sides`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `${constantIsPositive ? "Divide" : "Multiply"} both sides by ${absB}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
    {
      text: constantIsPositive
        ? `Adding ${absB} to both sides`
        : `Subtracting ${absB} from both sides`,
      isCorrect: false,
      misconceptionTag: "flipped_the_operation",
    },
  ];

  const goalConstant: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes the ${signedWord(b)} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: constantIsPositive
      ? `Undo addition by subtracting ${absB} from both sides.`
      : `Undo subtraction by adding ${absB} to both sides.`,
  };

  const stepAFlip: SolverStep = {
    stepId: "sign_flip_check_constant",
    // Now comes BEFORE cancel_constant/combine_constant - creates the
    // "simplified" line for the first time, showing just the resolved
    // symbol with the constant value still blank.
    rowUpdates: [{ slotId: "simplified", row: combinedRowSymbolOnly }],
    prompt: "Does the inequality sign flip here?",
    choices: shuffle([
      { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
    ]),
    explanationOnCorrect: "Adding or subtracting the same value from both sides never flips an inequality.",
  };

  const cancelConstDistractors = dedupNumeric("0", [
    { text: `${2 * absB}`, tag: "flipped_the_operation" },
    { text: `${absB}`, tag: "forgot_to_apply_operation" },
  ]);
  const cancelConstant: SolverStep = {
    stepId: "cancel_constant",
    rowUpdates: [],
    prompt: `What is ${absB} ${constOpSym} ${absB}?`,
    choices: shuffle([
      { text: "0", isCorrect: true, misconceptionTag: null },
      { text: cancelConstDistractors[0].text, isCorrect: false, misconceptionTag: cancelConstDistractors[0].tag },
      { text: cancelConstDistractors[1].text, isCorrect: false, misconceptionTag: cancelConstDistractors[1].tag },
    ]),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  };

  const combineConstDistractors = dedupNumeric(`${simplifiedRhs}`, [
    { text: `${constOpSym === "-" ? rhs + absB : rhs - absB}`, tag: "flipped_the_operation" },
    { text: `${-simplifiedRhs}`, tag: "sign_error" },
    { text: `${simplifiedRhs + 1}`, tag: "arithmetic_slip" },
  ]);
  const combineConstant: SolverStep = {
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "simplified", row: combinedRow }],
    prompt: `What is ${rhs} ${constOpSym} ${absB}?`,
    choices: shuffle([
      { text: `${simplifiedRhs}`, isCorrect: true, misconceptionTag: null },
      { text: combineConstDistractors[0].text, isCorrect: false, misconceptionTag: combineConstDistractors[0].tag },
      { text: combineConstDistractors[1].text, isCorrect: false, misconceptionTag: combineConstDistractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${simplifiedRhs}. The rest of the inequality gets brought down unchanged.`,
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

  // Symbol-only reveal - creates the "final" line for the first time,
  // showing just the resolved (possibly flipped) symbol with everything
  // else blank. Matches the constant phase's own sign_flip_check
  // exactly - confirmCoefficientOne (below) then evolves this SAME
  // line, filling in the isolated variable.
  const finalRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, afterMultSymbol),
  };

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    rowUpdates: [{ slotId: "final", row: finalRowSymbolOnly }],
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

  // ---------- Confirm the coefficient becomes 1 ----------
  // Evolves the SAME "final" line the flip-check already created,
  // filling in the isolated variable now that the symbol is resolved.
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const coeffConfirmedRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, BLANK, orientation, afterMultSymbol),
  };
  const confirmDistractors = dedupNumeric("1", [
    { text: coefficientKatex, tag: "forgot_to_apply_operation" },
    { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    { text: reciprocalKatex, tag: "left_answer_as_reciprocal" },
  ]);
  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    rowUpdates: [{ slotId: "final", row: coeffConfirmedRow }],
    prompt: `What is ${coefficientKatex} \u00d7 ${reciprocalKatex}?`,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: confirmDistractors[0].text, isCorrect: false, misconceptionTag: confirmDistractors[0].tag },
      { text: confirmDistractors[1].text, isCorrect: false, misconceptionTag: confirmDistractors[1].tag },
    ]),
    explanationOnCorrect: `${coefficientKatex} and ${reciprocalKatex} are reciprocals, so ${coefficientKatex} \u00d7 ${reciprocalKatex} equals 1, so the variable is isolated.`,
  };

  // --- Step C: compute the resulting value ---
  const needsCanonicalize = orientation === "expressionRight";
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

  const steps: SolverStep[] = [
    goalConstant,
    stepAFlip,
    cancelConstant,
    combineConstant,
    stepB,
    stepBFlip,
    confirmCoefficientOne,
    stepC,
  ];

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
      // Own separate slot, not "final" - so the pre-swap line stays
      // visible, and this becomes a genuinely new line below it, rather
      // than silently overwriting it. Same fix already made for
      // twoStepInequalities.ts and oneStepInequalities.ts.
      rowUpdates: [{ slotId: "canonicalized", row: canonicalRow }],
      prompt: "The goal is to get variable on the left. Do we flip the sign when we swap sides?",
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
      explanationOnCorrect: "We flip the inequality signs when we swap the sides of the inequality.",
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
    termAlign: "right",
  };
}

export function generateFractionalCoefficientsInequalityInstance(): SolverInstance {
  const ineq = generateFractionInequality();
  return buildFractionSolverInstance(ineq);
}
