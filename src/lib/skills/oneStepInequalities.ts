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

type Variant = "additive" | "multiplicative";

interface OneStepInequalityInstance {
  variant: Variant;
  a: number; // only meaningful for multiplicative
  b: number; // only meaningful for additive
  form: VariableForm; // only meaningful for multiplicative
  variableFirst: boolean; // only meaningful for additive (term order)
  orientation: Orientation;
  rhs: number;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

export function generateOneStepInequality(): OneStepInequalityInstance {
  const variant: Variant = randBool() ? "additive" : "multiplicative";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const origSymbol = randomSymbol(randInt);

  if (variant === "additive") {
    const b = randInt(1, 25) * (randBool() ? 1 : -1);
    let x = randInt(-15, 15);
    while (x === 0) x = randInt(-15, 15);
    const rhs = x + b;
    return {
      variant,
      a: 1,
      b,
      form: "multiply",
      variableFirst: randBool(),
      orientation,
      rhs,
      boundary: x,
      origSymbol,
    };
  }

  // multiplicative - `a` can be negative in both algebraic forms, which is
  // the only change from oneStepEquations.ts needed to get real coverage
  // of the sign-flip case.
  const form: VariableForm = randBool() ? "multiply" : "divide";
  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round(a * x * 100) / 100;
    return { variant, a, b: 0, form, variableFirst: true, orientation, rhs, boundary: x, origSymbol };
  }

  const a = randInt(2, 9) * randSign();
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  return { variant, a, b: 0, form, variableFirst: true, orientation, rhs: k, boundary: x, origSymbol };
}

// Shared tail: given the final canonical symbol/boundary, builds the
// (optional) canonicalization step and the graph step. Identical logic to
// the tail of twoStepInequalities.ts's buildSolverInstance - kept inline
// here rather than factored out further, since the two skill files are
// meant to stay independently readable, same as oneStepEquations.ts and
// twoStepEquations.ts already are.
function buildTailSteps(
  variableSymbol: string,
  orientation: Orientation,
  boundary: number,
  afterMultSymbol: ComparisonSymbol,
  needsCanonicalize: boolean
): SolverStep[] {
  const steps: SolverStep[] = [];
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

  return steps;
}

export function buildOneStepInstance(
  ineq: OneStepInequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { variant, a, b, form, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;
  const needsCanonicalize = orientation === "expressionRight";

  if (variant === "additive") {
    // x + b [sym] c - coefficient is always 1, so this never flips on its
    // own; only the canonicalization step (if needed) can change the
    // symbol here.
    const constantNatural = renderConstant(b);
    const constantForced = renderConstant(b, true);
    const exprTerm1 = variableFirst ? variableSymbol : constantNatural;
    const exprTerm2 = variableFirst ? constantForced : `+\\,${variableSymbol}`;
    const bIsSecond = variableFirst;

    const initialRow: GridRow = {
      cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation, origSymbol),
    };

    const cancelValue = -b;
    const cancelDisplay = renderConstant(cancelValue, true);
    const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
    const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
    const cancelRow: GridRow = {
      cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
    };

    const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
    const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
    const preCanonicalFinalRow: GridRow = {
      cells: assembleRow(finalExpr1, finalExpr2, renderConstant(boundary), orientation, origSymbol),
      highlight: needsCanonicalize ? undefined : "success",
    };

    const constantIsPositive = b >= 0;
    const stepOneChoices: Choice[] = [
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

    const stepOne: SolverStep = {
      stepId: "eliminate_constant",
      rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
      prompt: `What undoes the ${signedWord(b)} on the side with the variable?`,
      choices: shuffle(stepOneChoices),
      explanationOnCorrect: constantIsPositive
        ? `Undo addition by subtracting ${Math.abs(b)} from both sides.`
        : `Undo subtraction by adding ${Math.abs(b)} to both sides.`,
    };

    const stepOneFlip: SolverStep = {
      stepId: "sign_flip_check",
      rowUpdates: [],
      prompt: "Does the inequality sign flip here?",
      choices: shuffle([
        { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
        { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
      ]),
      explanationOnCorrect:
        "Adding or subtracting the same value from both sides never flips an inequality - only multiplying or dividing by a negative number does.",
    };

    const opSymbol = constantIsPositive ? "\u2212" : "+";
    const stepTwoChoices: Choice[] = [
      { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
      { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
      { text: `${rhs + b}`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
    ];

    const stepTwo: SolverStep = {
      stepId: "compute_value",
      rowUpdates: [{ slotId: "final", row: preCanonicalFinalRow }],
      prompt: `${rhs} ${opSymbol} ${Math.abs(b)} = ? What number completes the inequality?`,
      choices: shuffle(stepTwoChoices),
      explanationOnCorrect: `${rhs} ${opSymbol} ${Math.abs(b)} = ${boundary}.`,
    };

    const tailSteps = buildTailSteps(
      variableSymbol,
      orientation,
      boundary,
      origSymbol,
      needsCanonicalize
    );

    return {
      initialRow,
      steps: [stepOne, stepOneFlip, stepTwo, ...tailSteps],
      eqColumnIndex: eqColumnIndexFor(orientation),
    };
  }

  // multiplicative: ax [sym] c   or   x/a [sym] c   (b is always 0)
  const variableTermNatural =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol)
      : renderDivideTerm(a, variableSymbol);

  const initialRow: GridRow = {
    cells: assembleRow(variableTermNatural, BLANK, renderConstant(rhs), orientation, origSymbol),
  };

  let stepRow: GridRow;
  let prompt: string;
  let choices: Choice[];
  let explanationOnCorrect: string;
  let opWord: string;

  if (form === "multiply") {
    opWord = "dividing";
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `\\dfrac{${rhs}}{${a}}`;
    stepRow = { cells: assembleRow(divSetup, BLANK, divRhs, orientation, origSymbol) };
    prompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    choices = [
      { text: `Dividing both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiplying both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Adding ${a} to both sides`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
    ];
    explanationOnCorrect = `Undo multiplication by dividing both sides by ${a}.`;
  } else {
    opWord = "multiplying";
    const exprIsLeftOfEquals = orientation === "expressionLeft";
    const constantIsLeftOfEquals = orientation === "expressionRight";
    const multipliedVarTerm = exprIsLeftOfEquals
      ? `(${a})\\dfrac{${variableSymbol}}{${a}}`
      : `\\dfrac{${variableSymbol}}{${a}}(${a})`;
    const multipliedConstant = constantIsLeftOfEquals ? `(${a})(${rhs})` : `(${rhs})(${a})`;
    stepRow = { cells: assembleRow(multipliedVarTerm, BLANK, multipliedConstant, orientation, origSymbol) };
    prompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    choices = [
      { text: `Multiplying both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Dividing both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Adding ${a} to both sides`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
    ];
    explanationOnCorrect = `Undo division by multiplying both sides by ${a}.`;
  }

  const stepOne: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepRow }],
    prompt,
    choices: shuffle(choices),
    explanationOnCorrect,
  };

  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  const stepOneFlip: SolverStep = {
    stepId: "sign_flip_check",
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

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const sameSign = (rhs >= 0) === (a >= 0);
  const finalChoices: Choice[] = [
    { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
    { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `${rhs}`, isCorrect: false, misconceptionTag: "forgot_final_operation" },
  ];

  const preCanonicalFinalRow: GridRow = {
    cells: assembleRow(variableSymbol, BLANK, renderConstant(boundary), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const stepTwo: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: preCanonicalFinalRow }],
    prompt: `${rhs} ${opSymbol} ${a} = ? What number completes the inequality?`,
    choices: shuffle(finalChoices),
    explanationOnCorrect: sameSign
      ? `${rhs} ${opSymbol} ${a} = ${boundary}. Same signs give a positive result.`
      : `${rhs} ${opSymbol} ${a} = ${boundary}. Different signs give a negative result.`,
  };

  const tailSteps = buildTailSteps(
    variableSymbol,
    orientation,
    boundary,
    afterMultSymbol,
    needsCanonicalize
  );

  return {
    initialRow,
    steps: [stepOne, stepOneFlip, stepTwo, ...tailSteps],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateOneStepInequalityInstance(): SolverInstance {
  const ineq = generateOneStepInequality();
  return buildOneStepInstance(ineq);
}
