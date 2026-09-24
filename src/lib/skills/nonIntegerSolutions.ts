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
  Fraction,
  addFraction,
  decimalExpansionToPlainText,
  decimalExpansionTruncatedKatex,
  decimalOffByOneKatex,
  fractionToKatex,
  fromInt,
  makeFraction,
  mulFraction,
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

interface NonIntegerInstance {
  mode: Mode;
  a: number;
  b: Fraction;
  variableFirst: boolean;
  orientation: Orientation;
  rhs: Fraction;
  solution: Fraction;
}

// Denominators a middle/high schooler would recognize - includes ones that
// terminate cleanly (2, 4, 5, 8) and ones that repeat (3, 6, 7, 9, 11, 12, 13).
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

export function generateNonIntegerEquation(forcedMode?: Mode): NonIntegerInstance {
  const mode: Mode = forcedMode ?? (randBool() ? "fraction" : "decimal");
  const solution = pickSolution();

  // 'a' must NOT evenly divide the solution's denominator - otherwise the
  // "forgot to reduce" distractor collapses to the exact same fraction as
  // the correct answer, producing two textually identical MCQ choices.
  let a = randInt(2, 12) * randSign();
  while (solution.den % Math.abs(a) === 0) {
    a = randInt(2, 12) * randSign();
  }
  const b = pickConstant();

  const rhs = addFraction(mulFraction(fromInt(a), solution), b);

  return {
    mode,
    a,
    b,
    variableFirst: randBool(),
    orientation: randBool() ? "expressionLeft" : "expressionRight",
    rhs,
    solution,
  };
}

// The "PLAINTEXT:" prefix tells the grid's Cell component to render this
// directly as text (preserving Unicode combining marks) instead of
// passing it through KaTeX, which has a documented, unfixable-from-our-
// side bug where \overline sometimes silently fails to draw.
const PLAINTEXT_PREFIX = "PLAINTEXT:";

function renderGridValue(f: Fraction, mode: Mode, forceSign: boolean = false, addGap: boolean = true): string {
  if (mode === "fraction") return fractionToKatex(f, forceSign, addGap);
  return PLAINTEXT_PREFIX + decimalExpansionToPlainText(f, forceSign, addGap);
}

// For MCQ prompt/choice text: fraction mode still needs real KaTeX (wrap
// in $...$), but decimal mode's plain-text-with-overline needs NO KaTeX
// at all - inserting it as ordinary text (outside any $ markers) makes
// MixedText render it as-is, combining marks intact.
function renderPromptValue(f: Fraction, mode: Mode, forceSign: boolean = false): string {
  if (mode === "fraction") return `$${fractionToKatex(f, forceSign)}$`;
  return decimalExpansionToPlainText(f, forceSign);
}

export function buildNonIntegerSolverInstance(
  eq: NonIntegerInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { mode, a, b, variableFirst, orientation, rhs, solution } = eq;

  const variableTermNatural = renderMultiplyTerm(a, variableSymbol);
  const variableTermForced = renderMultiplyTerm(a, variableSymbol, true);
  const bNatural = renderGridValue(b, mode);
  const bForced = renderGridValue(b, mode, true);

  const exprTerm1 = variableFirst ? variableTermNatural : bNatural;
  const exprTerm2 = variableFirst ? bForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderGridValue(rhs, mode), orientation),
  };

  // Marked variant - the constant term gets an x-mark once cancel_constant
  // confirms the two opposites combine to 0, not before. Wraps whatever
  // renderGridValue already produced (including its own PLAINTEXT_PREFIX
  // for a repeating decimal-mode value) - MARKEDTERM: now detects that
  // nested prefix itself, so this works correctly for both modes.
  const markedExprTerm1 = bIsSecond ? exprTerm1 : `MARKEDTERM:${bNatural}`;
  const markedExprTerm2 = bIsSecond ? `MARKEDTERM:${bForced}` : exprTerm2;
  const initialRowMarked: GridRow = {
    cells: assembleRow(markedExprTerm1, markedExprTerm2, renderGridValue(rhs, mode), orientation),
  };

  // Step 1: eliminate the constant term - the cancellation annotation and
  // combined result now consistently match the problem's mode, fixing the
  // "silently switches to a fraction" inconsistency.
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

  const simplifiedRhs = subFraction(rhs, b); // = a * solution, exactly

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  const combinedKatex = renderGridValue(simplifiedRhs, mode);
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, combinedKatex, orientation),
  };

  // Step 2: fraction mode multiplies by the reciprocal of a rather than
  // dividing, since dividing merges into the fraction's own denominator
  // (e.g. -160/11 becomes the messier -160/-88); decimal mode keeps the
  // original divide-and-stack technique instead, since multiplying an
  // already-repeating decimal by a fraction reads worse than the plain
  // division did, not better. So the two modes now genuinely diverge in
  // which OPERATION the coefficient step teaches, not just how the same
  // operation is displayed.
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
    // Real KaTeX either way for the variable side - a plain-integer
    // coefficient term never needs the overline treatment.
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
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, multipliedConstant, orientation) };
    // Marked variant - the reciprocal and the coefficient inside "ax" are
    // the canceling pair (their product is 1), so both get the x-mark
    // together, once confirm_coefficient_one confirms that - not before.
    // Only the variable side needs a mark; the constant side is just a
    // computed result, same as the divide-form case elsewhere never
    // marks its own rhs either. MARKEDPARENMULTR: (reversed) matches
    // multipliedVarTerm's own argument-order flip above.
    const multipliedVarTermMarked = exprIsLeftOfEquals
      ? `MARKEDPARENMULT:${a}\u0006${variableSymbol}`
      : `MARKEDPARENMULTR:${a}\u0006${variableSymbol}`;
    const setupExpr1Marked = bIsSecond ? multipliedVarTermMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : multipliedVarTermMarked;
    stepBRowMarked = { cells: assembleRow(setupExpr1Marked, setupExpr2Marked, multipliedConstant, orientation) };
  } else {
    // Unchanged from before the reciprocal change - real KaTeX \dfrac for
    // the variable side (numerator/denominator always plain integers,
    // never needs an overline), and the same stacked-layout technique
    // for the constant side as everywhere else in decimal mode.
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `STACKEDFRACTION:${decimalExpansionToPlainText(simplifiedRhs)}\u0005${a}`;
    const setupExpr1 = bIsSecond ? divSetup : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetup;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation) };
    // Marked variant - same MARKEDFRACTION technique already used for
    // the divide-form case in twoStepEquations.ts and everywhere else:
    // the coefficient and its own copy in the denominator are the
    // canceling pair, marked together once confirmed.
    const divSetupMarked = `MARKEDFRACTION:${a}\u0006${variableSymbol}\u0005${a}`;
    const setupExpr1Marked = bIsSecond ? divSetupMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : divSetupMarked;
    stepBRowMarked = { cells: assembleRow(setupExpr1Marked, setupExpr2Marked, divRhs, orientation) };
  }

  // Step 3: final answer - the one that gets graded, so it MUST be
  // reliable. Uses the plain-text Unicode overline, never KaTeX's
  // \overline, for decimal mode.
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const finalAnswerKatex = renderGridValue(solution, mode);
  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, finalAnswerKatex, orientation),
    highlight: "success",
  };

  // ---- Step A choices ----
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

  // Split into three granular steps (goal -> confirm cancellation ->
  // confirm the new value), matching the pattern already established in
  // every other retrofitted skill, instead of jumping straight from
  // "choose the operation" to the fully-simplified row in one step.
  const goalConstant: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes the ${b.num >= 0 ? "+" : "-"}${bAbsPrompt} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: bIsPositive
      ? `Undo addition by subtracting ${bAbsPrompt} from both sides.`
      : `Undo subtraction by adding ${bAbsPrompt} to both sides.`,
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
    explanationOnCorrect: `The terms combine to ${renderPromptValue(simplifiedRhs, mode)}. The rest of the equation gets brought down unchanged.`,
  };

  // ---- Step B choices ----
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
        text: `Dividing both sides by ${renderPromptValue(simplifiedRhs, mode)}`,
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

  // ---------- Confirm the coefficient becomes 1 ----------
  // A NEW line, not a continuation of the setup line above - so that
  // setup stays visible permanently, and this becomes a new line below
  // it. Fraction mode confirms the reciprocal MULTIPLICATION (matching
  // the operation actually being performed there); decimal mode keeps
  // the original plain a/a division question, since that's still the
  // operation decimal mode actually performs.
  const coeffConfirmedRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, BLANK, orientation),
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
    // coefficient is actually confirmed to cancel) and
    // "coefficient_confirmed" (the new line showing the isolated
    // variable).
    rowUpdates: [
      { slotId: "simplified", row: stepBRowMarked },
      { slotId: "coefficient_confirmed", row: coeffConfirmedRow },
    ],
    prompt: confirmPrompt,
    choices: shuffle([
      { text: "$1$", isCorrect: true, misconceptionTag: null },
      { text: coeffConfirmDistractors[0].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[0].tag },
      { text: coeffConfirmDistractors[1].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[1].tag },
    ]),
    explanationOnCorrect: confirmExplanation,
  };

  // ---- Step C: compute the final value, mode-appropriate distractors ----
  const correctText = `${variableSymbol} = ${renderPromptValue(solution, mode)}`;
  const signFlipped: Fraction = { num: -solution.num, den: solution.den };
  const signFlipText = `${variableSymbol} = ${renderPromptValue(signFlipped, mode)}`;

  let thirdChoiceText: string;
  let thirdChoiceTag: string;
  if (mode === "fraction") {
    const unreduced: Fraction = { num: simplifiedRhs.num, den: simplifiedRhs.den * a };
    thirdChoiceText = `${variableSymbol} = $${fractionToKatex(unreduced)}$`;
    thirdChoiceTag = "forgot_to_reduce_fraction";
  } else {
    thirdChoiceText = terminatesAsDecimal(solution)
      ? `${variableSymbol} = $${decimalOffByOneKatex(solution)}$`
      : `${variableSymbol} = $${decimalExpansionTruncatedKatex(solution)}$`;
    thirdChoiceTag = terminatesAsDecimal(solution)
      ? "arithmetic_slip"
      : "forgot_repeating_decimal_notation";
  }

  const stepCChoices: Choice[] = [
    { text: correctText, isCorrect: true, misconceptionTag: null },
    { text: signFlipText, isCorrect: false, misconceptionTag: "sign_error" },
    { text: thirdChoiceText, isCorrect: false, misconceptionTag: thirdChoiceTag },
  ];

  const stepCPrompt =
    mode === "fraction"
      ? `What is the value of ${variableSymbol}, in simplest form?`
      : `What is the value of ${variableSymbol}? Use bar notation if it repeats.`;

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: finalRow }],
    prompt: stepCPrompt,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: `${variableSymbol} = ${renderPromptValue(solution, mode)}.`,
  };

  return {
    initialRow,
    steps: [goalConstant, cancelConstant, combineConstant, stepB, confirmCoefficientOne, stepC],
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateNonIntegerInstance(forcedMode?: Mode): SolverInstance {
  const eq = generateNonIntegerEquation(forcedMode);
  return buildNonIntegerSolverInstance(eq);
}
