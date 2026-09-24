import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
  BLANK,
  Orientation,
  assembleRow,
  eqColumnIndexFor,
  randBool,
  randInt,
  randSign,
  renderMultiplyTerm,
  renderReciprocal,
  shuffle,
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
import {
  Fraction,
  addFraction,
  decimalExpansion,
  decimalExpansionToPlainText,
  decimalExpansionTruncatedKatex,
  decimalOffByOneKatex,
  fractionToKatex,
  fromInt,
  makeFraction,
  mulFraction,
  negFraction,
  OVERLINE_END,
  OVERLINE_START,
  subFraction,
  terminatesAsDecimal,
} from "./fraction";

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

export type Mode = "fraction" | "decimal";

interface NonIntegerInequalityInstance {
  mode: Mode;
  a: number;
  b: Fraction;
  variableFirst: boolean;
  orientation: Orientation;
  rhs: Fraction;
  boundary: Fraction;
  origSymbol: ComparisonSymbol;
}

const SOLUTION_DENOMS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13];

function pickSolution(): Fraction {
  const q = SOLUTION_DENOMS[randInt(0, SOLUTION_DENOMS.length - 1)];
  let p = randInt(1, 3 * q) * randSign();
  while (p % q === 0) p = randInt(1, 3 * q) * randSign();
  return makeFraction(p, q);
}

function pickConstant(): Fraction {
  if (Math.random() < 0.7) return fromInt(randInt(1, 20) * randSign());
  const denoms = [2, 4, 5];
  const q = denoms[randInt(0, denoms.length - 1)];
  let p = randInt(1, 3 * q) * randSign();
  while (p % q === 0) p = randInt(1, 3 * q) * randSign();
  return makeFraction(p, q);
}

// `a` is already signed here (same as in nonIntegerSolutions.ts) - unlike
// two-step equations' divide form, this skill never needed an
// always-positive coefficient, so real coverage of the sign-flip case
// requires no change to the generation shape at all.
export function generateNonIntegerInequality(forcedMode?: Mode): NonIntegerInequalityInstance {
  const mode: Mode = forcedMode ?? (randBool() ? "fraction" : "decimal");
  const boundary = pickSolution();

  let a = randInt(2, 12) * randSign();
  while (boundary.den % Math.abs(a) === 0) {
    a = randInt(2, 12) * randSign();
  }
  const b = pickConstant();

  const rhs = addFraction(mulFraction(fromInt(a), boundary), b);

  return {
    mode,
    a,
    b,
    variableFirst: randBool(),
    orientation: randBool() ? "expressionLeft" : "expressionRight",
    rhs,
    boundary,
    origSymbol: randomSymbol(randInt),
  };
}

const PLAINTEXT_PREFIX = "PLAINTEXT:";

function renderGridValue(f: Fraction, mode: Mode, forceSign: boolean = false, addGap: boolean = true): string {
  if (mode === "fraction") return fractionToKatex(f, forceSign, addGap);
  return PLAINTEXT_PREFIX + decimalExpansionToPlainText(f, forceSign, addGap);
}

function renderPromptValue(f: Fraction, mode: Mode, forceSign: boolean = false): string {
  if (mode === "fraction") return `$${fractionToKatex(f, forceSign)}$`;
  return decimalExpansionToPlainText(f, forceSign);
}

// The graph step is a small standalone SVG, not a grid cell - it never
// goes through Cell/MixedText, so it needs its own label formatter rather
// than reusing renderGridValue. Fraction mode uses the FRACLABEL: mini-
// protocol (StepSolver.tsx renders it as a real stacked numerator/
// denominator, matching how fractions look everywhere else in the app,
// rather than plain "11/8" slash text). Decimal mode uses the
// OVERLINE_START/END markers from fraction.ts, which StepSolver.tsx's
// GraphLabel already knows how to render as an SVG text-decoration:overline
// span.
const FRACLABEL_PREFIX = "FRACLABEL:";

function graphLabel(f: Fraction, mode: Mode): string {
  if (mode === "fraction") {
    if (f.den === 1) return `${f.num}`;
    const sign = f.num < 0 ? "-" : "";
    return `${FRACLABEL_PREFIX}${sign}${Math.abs(f.num)}/${f.den}`;
  }
  const { sign, integerPart, nonRepeating, repeating } = decimalExpansion(f);
  const signStr = sign < 0 ? "-" : "";
  let body = `${integerPart}`;
  if (nonRepeating.length > 0 || repeating.length > 0) {
    body += "." + nonRepeating;
    if (repeating.length > 0) body += `${OVERLINE_START}${repeating}${OVERLINE_END}`;
  }
  return `${signStr}${body}`;
}

export function buildNonIntegerSolverInstance(
  ineq: NonIntegerInequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { mode, a, b, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;

  const variableTermNatural = renderMultiplyTerm(a, variableSymbol);
  const variableTermForced = renderMultiplyTerm(a, variableSymbol, true);
  const bNatural = renderGridValue(b, mode);
  const bForced = renderGridValue(b, mode, true);

  const exprTerm1 = variableFirst ? variableTermNatural : bNatural;
  const exprTerm2 = variableFirst ? bForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderGridValue(rhs, mode), orientation, origSymbol),
  };

  // Marked variant - the constant term gets an x-mark once cancel_constant
  // confirms the two opposites combine to 0, not before.
  const markedExprTerm1 = bIsSecond ? exprTerm1 : `MARKEDTERM:${bNatural}`;
  const markedExprTerm2 = bIsSecond ? `MARKEDTERM:${bForced}` : exprTerm2;
  const initialRowMarked: GridRow = {
    cells: assembleRow(markedExprTerm1, markedExprTerm2, renderGridValue(rhs, mode), orientation, origSymbol),
  };

  // --- Step A: eliminate the constant (never flips) ---
  const cancelValue: Fraction = { num: -b.num, den: b.den };
  const cancelDisplay = renderGridValue(cancelValue, mode, true, false);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };
  // Marked variant for the annotation's own opposite constant.
  const cancelExpr1Marked = bIsSecond ? BLANK : `MARKEDTERM:${cancelDisplay}`;
  const cancelExpr2Marked = bIsSecond ? `MARKEDTERM:${cancelDisplay}` : BLANK;
  const cancelRowMarked: GridRow = {
    cells: assembleRow(cancelExpr1Marked, cancelExpr2Marked, cancelDisplay, orientation, ""),
  };

  const simplifiedRhs = subFraction(rhs, b); // = a * boundary, exactly

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  // Symbol-only reveal - sign_flip_check_constant's own row (comes
  // before cancel_constant/combine_constant), showing just the resolved
  // symbol with everything else blank, since neither the isolated
  // variable side nor the combined value are known yet at this point.
  // Matches fractionalCoefficientsInequalities.ts's established pattern.
  const combinedRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, origSymbol),
  };
  // Full reveal - combine_constant's own row, now filling in both the
  // variable side and the combined value together, since the symbol was
  // already shown by sign_flip_check_constant on this same line.
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, renderGridValue(simplifiedRhs, mode), orientation, origSymbol),
  };

  const bIsPositive = b.num >= 0;
  const bAbsPrompt = renderPromptValue({ num: Math.abs(b.num), den: b.den }, mode);
  const stepAChoices: Choice[] = [
    {
      text: bIsPositive
        ? `Subtracting ${bAbsPrompt} from both sides`
        : `Adding ${bAbsPrompt} to both sides`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `${bIsPositive ? "Dividing" : "Multiplying"} both sides by ${bAbsPrompt}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
    {
      text: bIsPositive
        ? `Adding ${bAbsPrompt} to both sides`
        : `Subtracting ${bAbsPrompt} from both sides`,
      isCorrect: false,
      misconceptionTag: "flipped_the_operation",
    },
  ];

  // Split into granular steps (goal -> sign-flip check -> confirm
  // cancellation -> confirm the new value), matching the pattern already
  // established in fractionalCoefficientsInequalities.ts and every other
  // retrofitted skill, instead of jumping straight from "choose the
  // operation" to the fully-simplified row in one step.
  const goalConstant: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes the ${b.num >= 0 ? "+" : "-"}${bAbsPrompt} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: bIsPositive
      ? `Undo addition by subtracting ${bAbsPrompt} from both sides.`
      : `Undo subtraction by adding ${bAbsPrompt} to both sides.`,
  };

  const stepAFlip: SolverStep = {
    stepId: "sign_flip_check_constant",
    // Creates the "simplified" line for the first time, showing just the
    // resolved symbol with the constant value still blank - matching
    // fractionalCoefficientsInequalities.ts's established pattern.
    rowUpdates: [{ slotId: "simplified", row: combinedRowSymbolOnly }],
    prompt: "Does the inequality sign flip here?",
    choices: shuffle([
      { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
    ]),
    explanationOnCorrect:
      "Adding or subtracting the same value from both sides never flips an inequality - only multiplying or dividing by a negative number does.",
  };

  const cancelConstant: SolverStep = {
    stepId: "cancel_constant",
    // Both opposite constants get the x-mark together, once they're
    // confirmed to combine to 0.
    rowUpdates: [
      { slotId: "__initial__", row: initialRowMarked },
      { slotId: "cancel_annotation", row: cancelRowMarked },
    ],
    prompt: `What is ${bAbsPrompt} ${bIsPositive ? "-" : "+"} ${bAbsPrompt}?`,
    choices: shuffle([
      { text: "$0$", isCorrect: true, misconceptionTag: null },
      {
        text: `$${b.num >= 0 ? "2" : "-2"}$ \u00d7 ${bAbsPrompt}`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
      { text: bAbsPrompt, isCorrect: false, misconceptionTag: "forgot_to_apply_operation" },
    ]),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  };

  const combineConstDistractors = dedupNumeric(renderPromptValue(simplifiedRhs, mode), [
    { text: renderPromptValue({ num: -simplifiedRhs.num, den: simplifiedRhs.den }, mode), tag: "sign_error" },
    { text: renderPromptValue(rhs, mode), tag: "forgot_to_apply_operation" },
    { text: renderPromptValue(addFraction(simplifiedRhs, fromInt(1)), mode), tag: "arithmetic_slip" },
  ]);
  const combineConstant: SolverStep = {
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "simplified", row: combinedRow }],
    prompt: `What is ${renderPromptValue(rhs, mode)} ${bIsPositive ? "-" : "+"} ${bAbsPrompt}?`,
    choices: shuffle([
      { text: renderPromptValue(simplifiedRhs, mode), isCorrect: true, misconceptionTag: null },
      { text: combineConstDistractors[0].text, isCorrect: false, misconceptionTag: combineConstDistractors[0].tag },
      { text: combineConstDistractors[1].text, isCorrect: false, misconceptionTag: combineConstDistractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${renderPromptValue(simplifiedRhs, mode)}. The rest of the inequality gets brought down unchanged.`,
  };

  // --- Step B: eliminate the coefficient (flips iff a < 0) ---
  // Fraction mode multiplies by the reciprocal of a rather than dividing
  // - same reasoning as nonIntegerSolutions.ts: dividing merges into the
  // fraction's own denominator, producing a messier result than
  // multiplying by the reciprocal does. Decimal mode keeps the original
  // divide-and-stack technique, since multiplying an already-repeating
  // decimal by a fraction reads worse than the plain division did.
  const reciprocal = renderReciprocal(a, 1);
  // Which side of the whole row each half sits on - determines which
  // edge of its own cell text the reciprocal belongs at, so it lands on
  // the OUTER edge of the whole expression rather than always sitting
  // immediately next to the value it's multiplying. Same reasoning
  // already established in fractionalCoefficientsInequalities.ts.
  const exprIsLeftOfEquals = orientation === "expressionLeft";
  const constantIsLeftOfEquals = orientation === "expressionRight";
  let stepBRow: GridRow;
  let stepBRowMarked: GridRow;
  if (mode === "fraction") {
    // Wrapped in PARENMULT: (not a plain string concatenation) so the
    // variable term gets its own parens too, matching the constant
    // side's own treatment via renderParenMult - a bare "(recip)-4x"
    // string reads visually as subtraction, not multiplication, once
    // the variable term's own coefficient is negative. The argument
    // order itself flips with exprIsLeftOfEquals/constantIsLeftOfEquals,
    // putting the reciprocal on the OUTER edge of the whole row.
    const multipliedVarTerm = exprIsLeftOfEquals
      ? `PARENMULT:${reciprocal}\u0007${variableTermNatural}`
      : `PARENMULT:${variableTermNatural}\u0007${reciprocal}`;
    const multipliedConstant = constantIsLeftOfEquals
      ? `PARENMULT:${reciprocal}\u0007${fractionToKatex(simplifiedRhs)}`
      : `PARENMULT:${fractionToKatex(simplifiedRhs)}\u0007${reciprocal}`;
    const setupExpr1 = bIsSecond ? multipliedVarTerm : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : multipliedVarTerm;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, multipliedConstant, orientation, origSymbol) };
    // Marked variant - the reciprocal and the coefficient inside "ax" are
    // the canceling pair (their product is 1), so both get the x-mark
    // together, once confirm_coefficient_one confirms that - not before.
    // MARKEDPARENMULTR: (reversed) is the same field in the same order,
    // just swapping which parenthetical group renders first, matching
    // multipliedVarTerm's own argument-order flip above.
    const multipliedVarTermMarked = exprIsLeftOfEquals
      ? `MARKEDPARENMULT:${a}\u0006${variableSymbol}`
      : `MARKEDPARENMULTR:${a}\u0006${variableSymbol}`;
    const setupExpr1Marked = bIsSecond ? multipliedVarTermMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : multipliedVarTermMarked;
    stepBRowMarked = {
      cells: assembleRow(setupExpr1Marked, setupExpr2Marked, multipliedConstant, orientation, origSymbol),
    };
  } else {
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `STACKEDFRACTION:${decimalExpansionToPlainText(simplifiedRhs)}\u0005${a}`;
    const setupExpr1 = bIsSecond ? divSetup : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetup;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation, origSymbol) };
    // Marked variant - same MARKEDFRACTION technique already used for
    // the divide-form case everywhere else: the coefficient and its own
    // copy in the denominator are the canceling pair, marked together
    // once confirmed.
    const divSetupMarked = `MARKEDFRACTION:${a}\u0006${variableSymbol}\u0005${a}`;
    const setupExpr1Marked = bIsSecond ? divSetupMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : divSetupMarked;
    stepBRowMarked = { cells: assembleRow(setupExpr1Marked, setupExpr2Marked, divRhs, orientation, origSymbol) };
  }

  const simplifiedRhsPrompt = renderPromptValue(simplifiedRhs, mode);
  const reciprocalKatex = `$${reciprocal}$`;
  const coefficientKatex = `$${a}$`;
  let stepBChoices: Choice[];
  let stepBExplanation: string;
  if (mode === "fraction") {
    stepBChoices = [
      { text: `Multiplying both sides by ${reciprocalKatex}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiplying both sides by ${coefficientKatex}`,
        isCorrect: false,
        misconceptionTag: "forgot_to_flip_reciprocal",
      },
      {
        text: `Dividing both sides by ${reciprocalKatex}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
    ];
    stepBExplanation = "Multiplying both sides by the reciprocal clears the coefficient.";
  } else {
    stepBChoices = [
      { text: `Dividing both sides by ${coefficientKatex}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiplying both sides by ${coefficientKatex}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Dividing both sides by ${simplifiedRhsPrompt}`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ];
    stepBExplanation = `Undo multiplication by dividing both sides by ${a}.`;
  }

  const stepB: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepBRow }],
    prompt:
      mode === "fraction"
        ? `What operation isolates ${variableSymbol} when its coefficient is ${coefficientKatex}?`
        : `What undoes multiplying ${variableSymbol} by ${a}?`,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: stepBExplanation,
  };

  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  // Symbol-only reveal - sign_flip_check_coefficient's own row, showing
  // just the resolved (possibly flipped) symbol with everything else
  // blank, since the isolated variable isn't known yet at this point.
  // Matches fractionalCoefficientsInequalities.ts's established pattern,
  // and the constant phase's own sign_flip_check above.
  const finalRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, afterMultSymbol),
  };

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    // Creates the "final" line for the first time, showing just the
    // resolved symbol - confirmCoefficientOne (below) then evolves this
    // SAME line, filling in the isolated variable.
    rowUpdates: [{ slotId: "final", row: finalRowSymbolOnly }],
    prompt:
      mode === "fraction"
        ? `Does the inequality sign flip here? (multiplying both sides by ${reciprocalKatex})`
        : `Does the inequality sign flip here? (dividing both sides by ${a})`,
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
      ? mode === "fraction"
        ? `Multiplying both sides by a negative number (${reciprocalKatex}) flips the inequality sign.`
        : `Multiplying or dividing both sides by a negative number (${a}) flips the inequality sign.`
      : mode === "fraction"
      ? `${reciprocalKatex} is positive, so multiplying both sides by it does not flip the inequality sign.`
      : `${a} is positive, so dividing both sides by it does not flip the inequality sign.`,
  };

  // --- Confirm the coefficient becomes 1 ---
  // Evolves the SAME "final" line the flip-check already created, filling
  // in the isolated variable now that the symbol is resolved.
  const needsCanonicalize = orientation === "expressionRight";
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const coeffConfirmedRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, BLANK, orientation, afterMultSymbol),
  };
  let confirmPrompt: string;
  let confirmExplanation: string;
  let confirmDistractorCandidates: { text: string; tag: string }[];
  if (mode === "fraction") {
    confirmPrompt = `What is ${coefficientKatex} \u00d7 ${reciprocalKatex}?`;
    confirmExplanation = `${coefficientKatex} and ${reciprocalKatex} are reciprocals, so ${coefficientKatex} \u00d7 ${reciprocalKatex} equals 1, so the variable is isolated.`;
    confirmDistractorCandidates = [
      { text: coefficientKatex, tag: "forgot_to_apply_operation" },
      { text: "$0$", tag: "confuses_division_with_subtraction_pattern" },
      { text: reciprocalKatex, tag: "left_answer_as_reciprocal" },
    ];
  } else {
    confirmPrompt = `What is ${a} \u00f7 ${a}?`;
    confirmExplanation = `The coefficient ${a} divided by itself is 1, so the variable is isolated.`;
    confirmDistractorCandidates = [
      { text: coefficientKatex, tag: "forgot_to_apply_operation" },
      { text: "$0$", tag: "confuses_division_with_subtraction_pattern" },
      { text: `$${-a}$`, tag: "sign_error" },
    ];
  }
  const coeffConfirmDistractors = dedupNumeric("$1$", confirmDistractorCandidates);
  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    // Updates BOTH "simplified" (adding the x-marks, now that the
    // coefficient is actually confirmed to cancel) and "final" (the new
    // line showing the isolated variable, before its value is filled in).
    rowUpdates: [
      { slotId: "simplified", row: stepBRowMarked },
      { slotId: "final", row: coeffConfirmedRow },
    ],
    prompt: confirmPrompt,
    choices: shuffle([
      { text: "$1$", isCorrect: true, misconceptionTag: null },
      { text: coeffConfirmDistractors[0].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[0].tag },
      { text: coeffConfirmDistractors[1].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[1].tag },
    ]),
    explanationOnCorrect: confirmExplanation,
  };

  // --- Step C: compute the resulting value, mode-appropriate distractors ---
  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderGridValue(boundary, mode), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const correctText = renderPromptValue(boundary, mode);
  const signFlipText = renderPromptValue(negFraction(boundary), mode);

  let thirdChoiceText: string;
  let thirdChoiceTag: string;
  if (mode === "fraction") {
    const unreduced: Fraction = { num: simplifiedRhs.num, den: simplifiedRhs.den * a };
    thirdChoiceText = `$${fractionToKatex(unreduced)}$`;
    thirdChoiceTag = "forgot_to_reduce_fraction";
  } else {
    thirdChoiceText = terminatesAsDecimal(boundary)
      ? `$${decimalOffByOneKatex(boundary)}$`
      : `$${decimalExpansionTruncatedKatex(boundary)}$`;
    thirdChoiceTag = terminatesAsDecimal(boundary) ? "arithmetic_slip" : "forgot_repeating_decimal_notation";
  }

  const stepCChoices: Choice[] = [
    { text: correctText, isCorrect: true, misconceptionTag: null },
    { text: signFlipText, isCorrect: false, misconceptionTag: "sign_error" },
    { text: thirdChoiceText, isCorrect: false, misconceptionTag: thirdChoiceTag },
  ];

  const stepCPrompt =
    mode === "fraction"
      ? "What number completes the inequality, in simplest form?"
      : "What number completes the inequality? Use bar notation if it repeats.";

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: stepCPrompt,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: `The value is ${renderPromptValue(boundary, mode)}.`,
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
      cells: assembleRow(renderGridValue(boundary, mode), BLANK, variableSymbol, orientation, canonicalSymbol),
      highlight: "success",
    };

    steps.push({
      stepId: "canonicalize_orientation",
      // Its OWN new slot, not "final" - so the pre-swap line stays
      // visible on its own permanent line, and this becomes a new line
      // below it, rather than overwriting it in place. Same fix already
      // made for oneStepInequalities.ts and
      // fractionalCoefficientsInequalities.ts.
      rowUpdates: [{ slotId: "canonicalized", row: canonicalRow }],
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
      explanationOnCorrect: `Swapping which side each quantity sits on flips the symbol: ${renderPromptValue(
        boundary,
        mode
      )} ${plainSymbol(afterMultSymbol)} ${variableSymbol} becomes ${variableSymbol} ${plainSymbol(
        canonicalSymbol
      )} ${renderPromptValue(boundary, mode)}.`,
    });
  }

  // --- Final step: graph the solution on a number line ---
  const dir = symbolDirection(canonicalSymbol);
  const inc = isInclusive(canonicalSymbol);
  const otherDir = dir === "left" ? "right" : "left";
  const label = graphLabel(boundary, mode);

  steps.push({
    stepId: "graph_solution",
    rowUpdates: [],
    prompt: `Which number line shows ${variableSymbol} ${plainSymbol(canonicalSymbol)} ${renderPromptValue(
      boundary,
      mode
    )}?`,
    choices: shuffle([
      {
        text: graphChoiceText(label, symbolFromDirectionInclusive(dir, inc)),
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: graphChoiceText(label, symbolFromDirectionInclusive(dir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_boundary",
      },
      {
        text: graphChoiceText(label, symbolFromDirectionInclusive(otherDir, inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_direction",
      },
      {
        text: graphChoiceText(label, symbolFromDirectionInclusive(otherDir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_graph",
      },
    ]),
    explanationOnCorrect: `${inc ? "A closed" : "An open"} circle, shaded to the ${dir}, matches ${variableSymbol} ${plainSymbol(
      canonicalSymbol
    )} ${renderPromptValue(boundary, mode)}.`,
  });

  return {
    initialRow,
    steps,
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateNonIntegerInequalityInstance(forcedMode?: Mode): SolverInstance {
  const ineq = generateNonIntegerInequality(forcedMode);
  return buildNonIntegerSolverInstance(ineq);
}
