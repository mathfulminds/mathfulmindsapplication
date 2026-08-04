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

function renderGridValue(f: Fraction, mode: Mode, forceSign: boolean = false): string {
  if (mode === "fraction") return fractionToKatex(f, forceSign);
  return PLAINTEXT_PREFIX + decimalExpansionToPlainText(f, forceSign);
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

  // --- Step A: eliminate the constant (never flips) ---
  const cancelValue: Fraction = { num: -b.num, den: b.den };
  const cancelDisplay = renderGridValue(cancelValue, mode, true);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };

  const simplifiedRhs = subFraction(rhs, b); // = a * boundary, exactly

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
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
      : `Undo subtraction by adding ${bAbsPrompt} from both sides.`,
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
      "Adding or subtracting the same value from both sides never flips an inequality - only multiplying or dividing by a negative number does.",
  };

  // --- Step B: eliminate the coefficient (flips iff a < 0) ---
  const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
  const divRhs =
    mode === "fraction"
      ? `\\dfrac{${simplifiedRhs.num}}{${simplifiedRhs.den * a}}`
      : `STACKEDFRACTION:${decimalExpansionToPlainText(simplifiedRhs)}\u0005${a}`;
  const setupExpr1 = bIsSecond ? divSetup : BLANK;
  const setupExpr2 = bIsSecond ? BLANK : divSetup;
  const stepBRow: GridRow = {
    cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation, origSymbol),
  };

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

  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    rowUpdates: [],
    prompt: `Does the inequality sign flip here? (dividing both sides by ${a})`,
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
      ? `Multiplying or dividing both sides by a negative number (${a}) flips the inequality sign.`
      : `${a} is positive, so dividing both sides by it does not flip the inequality sign.`,
  };

  // --- Step C: compute the resulting value, mode-appropriate distractors ---
  const needsCanonicalize = orientation === "expressionRight";
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
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

  const steps: SolverStep[] = [stepA, stepAFlip, stepB, stepBFlip, stepC];

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
  };
}

export function generateNonIntegerInequalityInstance(forcedMode?: Mode): SolverInstance {
  const ineq = generateNonIntegerInequality(forcedMode);
  return buildNonIntegerSolverInstance(ineq);
}
