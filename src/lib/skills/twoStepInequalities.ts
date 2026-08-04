import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
  BLANK,
  Orientation,
  VariableForm,
  assembleRow,
  eqColumnIndexFor,
  randBool,
  randInt,
  randMultiplyCoefficient,
  randSign,
  renderConstant,
  renderDivideTerm,
  renderMultiplyTerm,
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

interface InequalityInstance {
  a: number;
  b: number;
  form: VariableForm;
  variableFirst: boolean;
  orientation: Orientation;
  rhs: number;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

// Same random shape as generateEquation() in twoStepEquations.ts, with two
// deliberate differences: origSymbol replaces "=", and the divide-form
// coefficient `a` is allowed to be negative (randSign()) instead of always
// positive - that's the only thing that needs to vary to get real coverage
// of the sign-flip case in both algebraic forms.
export function generateInequality(): InequalityInstance {
  const form: VariableForm = randBool() ? "multiply" : "divide";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const variableFirst = randBool();
  const b = randInt(1, 20) * (randBool() ? 1 : -1);
  const origSymbol = randomSymbol(randInt);

  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round((a * x + b) * 100) / 100;
    return { a, b, form, variableFirst, orientation, rhs, boundary: x, origSymbol };
  }

  const a = randInt(2, 9) * randSign();
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  const rhs = k + b;
  return { a, b, form, variableFirst, orientation, rhs, boundary: x, origSymbol };
}

export function buildSolverInstance(
  ineq: InequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { a, b, form, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;

  const variableTermNatural =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol)
      : renderDivideTerm(a, variableSymbol);
  const constantBNatural = renderConstant(b);
  const constantBForced = renderConstant(b, true);
  const variableTermForced =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol, true)
      : renderDivideTerm(a, variableSymbol, true);

  const exprTerm1 = variableFirst ? variableTermNatural : constantBNatural;
  const exprTerm2 = variableFirst ? constantBForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation, origSymbol),
  };

  // --- Step A: eliminate the additive constant (never flips) ---
  const cancelValue = -b;
  const cancelDisplay = renderConstant(cancelValue, true);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };

  const newRhs = Math.round((rhs - b) * 100) / 100;

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  const combinedRow: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(newRhs), orientation, origSymbol),
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
      "Adding or subtracting the same value from both sides never flips an inequality - only multiplying or dividing by a negative number does.",
  };

  // --- Step B: eliminate the coefficient (flips iff a < 0) ---
  let stepBRow: GridRow;
  let stepBPrompt: string;
  let stepBChoices: Choice[];
  let stepBExplanation: string;
  let opWord: string;

  if (form === "multiply") {
    opWord = "dividing";
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `\\dfrac{${newRhs}}{${a}}`;
    const setupExpr1 = bIsSecond ? divSetup : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetup;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation, origSymbol) };
    stepBPrompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    stepBChoices = [
      { text: `Dividing both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiplying both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Dividing both sides by ${Math.abs(b)}`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ];
    stepBExplanation = `Undo multiplication by dividing both sides by ${a}.`;
  } else {
    opWord = "multiplying";
    const exprIsLeftOfEquals = orientation === "expressionLeft";
    const constantIsLeftOfEquals = orientation === "expressionRight";

    const multipliedVarTerm = exprIsLeftOfEquals
      ? `(${a})\\dfrac{${variableSymbol}}{${a}}`
      : `\\dfrac{${variableSymbol}}{${a}}(${a})`;
    const multipliedConstant = constantIsLeftOfEquals
      ? `(${a})(${newRhs})`
      : `(${newRhs})(${a})`;
    const setupExpr1 = bIsSecond ? multipliedVarTerm : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : multipliedVarTerm;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, multipliedConstant, orientation, origSymbol) };
    stepBPrompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    stepBChoices = [
      { text: `Multiplying both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Dividing both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Multiplying both sides by ${Math.abs(b)}`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ];
    stepBExplanation = `Undo division by multiplying both sides by ${a}.`;
  }

  const stepB: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepBRow }],
    prompt: stepBPrompt,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: stepBExplanation,
  };

  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    rowUpdates: [],
    prompt: `Does the inequality sign flip here? (${opWord} both sides by ${a})`,
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
      : `${a} is positive, so ${opWord} both sides by it does not flip the inequality sign.`,
  };

  // --- Step C: compute the resulting value ---
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const needsCanonicalize = orientation === "expressionRight";

  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(boundary), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const sameSign = (newRhs >= 0) === (a >= 0);
  const stepCChoices: Choice[] = [
    { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
    { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `${newRhs}`, isCorrect: false, misconceptionTag: "forgot_final_operation" },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `${newRhs} ${opSymbol} ${a} = ? What number completes the inequality?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: sameSign
      ? `${newRhs} ${opSymbol} ${a} = ${boundary}. Same signs give a positive result.`
      : `${newRhs} ${opSymbol} ${a} = ${boundary}. Different signs give a negative result.`,
  };

  const steps: SolverStep[] = [stepA, stepAFlip, stepB, stepBFlip, stepC];

  // --- Step D (conditional): canonicalize so the variable reads first ---
  // Only reached when orientation is "expressionRight" - the variable
  // landed on the right of the symbol (e.g. "boundary > x"). Reuses the
  // SAME orientation value in assembleRow (not "expressionLeft") so the
  // grid's single instance-level eqColumnIndex stays valid for every row -
  // only which VALUES occupy the constantCell/exprCell argument slots
  // changes, not the column layout itself.
  let canonicalSymbol = afterMultSymbol;
  if (needsCanonicalize) {
    canonicalSymbol = flipSymbol(afterMultSymbol);
    const canonicalRow: GridRow = {
      cells: assembleRow(renderConstant(boundary), BLANK, variableSymbol, orientation, canonicalSymbol),
      highlight: "success",
    };

    const canonicalize: SolverStep = {
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
    };

    steps.push(canonicalize);
  }

  // --- Final step: graph the solution on a number line ---
  const dir = symbolDirection(canonicalSymbol);
  const inc = isInclusive(canonicalSymbol);
  const otherDir = dir === "left" ? "right" : "left";

  const graphStep: SolverStep = {
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
  };

  steps.push(graphStep);

  return {
    initialRow,
    steps,
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateTwoStepInequalityInstance(): SolverInstance {
  const ineq = generateInequality();
  return buildSolverInstance(ineq);
}
