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

function renderGridValue(f: Fraction, mode: Mode, forceSign: boolean = false): string {
  if (mode === "fraction") return fractionToKatex(f, forceSign);
  return PLAINTEXT_PREFIX + decimalExpansionToPlainText(f, forceSign);
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

  // Step 1: eliminate the constant term - the cancellation annotation and
  // combined result now consistently match the problem's mode, fixing the
  // "silently switches to a fraction" inconsistency.
  const cancelValue: Fraction = { num: -b.num, den: b.den };
  const cancelDisplay = renderGridValue(cancelValue, mode, true);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };

  const simplifiedRhs = subFraction(rhs, b); // = a * solution, exactly

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  const combinedKatex = renderGridValue(simplifiedRhs, mode);
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, combinedKatex, orientation),
  };

  // Step 2: division setup, ALWAYS shown as a vertically stacked bar.
  // Fraction mode uses a real KaTeX \dfrac (numerator/denominator are
  // always plain integers there, no overline ever needed). Decimal mode
  // builds the stacked layout ourselves instead, so the numerator can use
  // the same reliable real-KaTeX-plus-our-own-border technique as
  // everywhere else, rather than KaTeX's own \overline nested inside a
  // fraction (which has the same documented rendering bug).
  const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
  const divRhs =
    mode === "fraction"
      ? `\\dfrac{${simplifiedRhs.num}}{${simplifiedRhs.den * a}}`
      : `STACKEDFRACTION:${decimalExpansionToPlainText(simplifiedRhs)}\u0005${a}`;
  const setupExpr1 = bIsSecond ? divSetup : BLANK;
  const setupExpr2 = bIsSecond ? BLANK : divSetup;
  const stepBRow: GridRow = {
    cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation),
  };

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

  const stepA: SolverStep = {
    stepId: "eliminate_constant",
    rowUpdates: [
      { slotId: "cancel_annotation", row: cancelRow },
      { slotId: "simplified", row: combinedRow },
    ],
    prompt: `What undoes the ${b.num >= 0 ? "+" : "-"}${bAbsPrompt} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: bIsPositive
      ? `Undo addition by subtracting ${bAbsPrompt} from both sides.`
      : `Undo subtraction by adding ${bAbsPrompt} to both sides.`,
  };

  // ---- Step B choices ----
  const simplifiedRhsPrompt = renderPromptValue(simplifiedRhs, mode);
  const stepBChoices: Choice[] = [
    { text: `Dividing both sides by ${a}`, isCorrect: true, misconceptionTag: null },
    {
      text: `Multiplying both sides by ${a}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
    {
      text: `Dividing both sides by ${simplifiedRhsPrompt}`,
      isCorrect: false,
      misconceptionTag: "targets_wrong_term_first",
    },
  ];

  const stepB: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepBRow }],
    prompt: `What undoes multiplying ${variableSymbol} by ${a}?`,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: `Undo multiplication by dividing both sides by ${a}.`,
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
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: stepCPrompt,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: `${variableSymbol} = ${renderPromptValue(solution, mode)}.`,
  };

  return {
    initialRow,
    steps: [stepA, stepB, stepC],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateNonIntegerInstance(forcedMode?: Mode): SolverInstance {
  const eq = generateNonIntegerEquation(forcedMode);
  return buildNonIntegerSolverInstance(eq);
}
