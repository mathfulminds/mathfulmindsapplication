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
  renderConstant,
  renderDivideTerm,
  renderMultiplyTerm,
  shuffle,
  signedWord,
} from "./isolateVariableCore";

type Variant = "additive" | "multiplicative";

interface OneStepInstance {
  variant: Variant;
  a: number; // only meaningful for multiplicative
  b: number; // only meaningful for additive
  form: VariableForm; // only meaningful for multiplicative
  variableFirst: boolean; // only meaningful for additive (term order)
  orientation: Orientation;
  rhs: number;
  solution: number;
}

export function generateOneStepEquation(): OneStepInstance {
  const variant: Variant = randBool() ? "additive" : "multiplicative";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";

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
      solution: x,
    };
  }

  // multiplicative
  const form: VariableForm = randBool() ? "multiply" : "divide";
  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round(a * x * 100) / 100;
    return { variant, a, b: 0, form, variableFirst: true, orientation, rhs, solution: x };
  }

  const a = randInt(2, 9);
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  return { variant, a, b: 0, form, variableFirst: true, orientation, rhs: k, solution: x };
}

export function buildOneStepInstance(
  eq: OneStepInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { variant, a, b, form, variableFirst, orientation, rhs, solution } = eq;

  if (variant === "additive") {
    // x + b = c  (coefficient is always 1, so there's no second step -
    // eliminating the constant immediately produces the final answer.)
    const constantNatural = renderConstant(b);
    const constantForced = renderConstant(b, true);
    const exprTerm1 = variableFirst ? variableSymbol : constantNatural;
    const exprTerm2 = variableFirst ? constantForced : `+\\,${variableSymbol}`;
    const bIsSecond = variableFirst;

    const initialRow: GridRow = {
      cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation),
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
    const finalRow: GridRow = {
      cells: assembleRow(finalExpr1, finalExpr2, renderConstant(solution), orientation),
      highlight: "success",
    };

    const constantIsPositive = b >= 0;
    const stepOneChoices: Choice[] = [
      {
        text: constantIsPositive
          ? `Subtract ${Math.abs(b)} from both sides`
          : `Add ${Math.abs(b)} to both sides`,
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
          ? `Add ${Math.abs(b)} to both sides`
          : `Subtract ${Math.abs(b)} from both sides`,
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

    // Second step: explicitly test the arithmetic, same as the
    // multiplicative variant's "compute the value" step.
    const opSymbol = constantIsPositive ? "\u2212" : "+";
    const stepTwoChoices: Choice[] = [
      { text: `${variableSymbol} = ${solution}`, isCorrect: true, misconceptionTag: null },
      {
        text: `${variableSymbol} = ${-solution}`,
        isCorrect: false,
        misconceptionTag: "sign_error",
      },
      {
        text: `${variableSymbol} = ${rhs + b}`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
    ];

    const stepTwo: SolverStep = {
      stepId: "compute_value",
      rowUpdates: [{ slotId: "final", row: finalRow }],
      prompt: `${rhs} ${opSymbol} ${Math.abs(b)} = ? What is the value of ${variableSymbol}?`,
      choices: shuffle(stepTwoChoices),
      explanationOnCorrect: `${rhs} ${opSymbol} ${Math.abs(b)} = ${solution}.`,
    };

    return {
      initialRow,
      steps: [stepOne, stepTwo],
      eqColumnIndex: eqColumnIndexFor(orientation),
    };
  }

  // multiplicative: ax = c   or   x/a = c   (b is always 0 - no constant
  // term exists at all, so there's nothing to eliminate first.)
  const variableTermNatural =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol)
      : renderDivideTerm(a, variableSymbol);

  const initialRow: GridRow = {
    cells: assembleRow(variableTermNatural, BLANK, renderConstant(rhs), orientation),
  };

  let stepRow: GridRow;
  let prompt: string;
  let choices: Choice[];
  let explanationOnCorrect: string;

  if (form === "multiply") {
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `\\dfrac{${rhs}}{${a}}`;
    stepRow = { cells: assembleRow(divSetup, BLANK, divRhs, orientation) };
    prompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    choices = [
      { text: `Divide both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiply both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Add ${a} to both sides`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
    ];
    explanationOnCorrect = `Undo multiplication by dividing both sides by ${a}.`;
  } else {
    const exprIsLeftOfEquals = orientation === "expressionLeft";
    const constantIsLeftOfEquals = orientation === "expressionRight";
    const multipliedVarTerm = exprIsLeftOfEquals
      ? `(${a})\\dfrac{${variableSymbol}}{${a}}`
      : `\\dfrac{${variableSymbol}}{${a}}(${a})`;
    const multipliedConstant = constantIsLeftOfEquals
      ? `(${a})(${rhs})`
      : `(${rhs})(${a})`;
    stepRow = { cells: assembleRow(multipliedVarTerm, BLANK, multipliedConstant, orientation) };
    prompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    choices = [
      { text: `Multiply both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Divide both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Add ${a} to both sides`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
    ];
    explanationOnCorrect = `Undo division by multiplying both sides by ${a}.`;
  }

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const computed = form === "multiply" ? rhs / a : rhs * a;
  const sameSign = (rhs >= 0) === (a >= 0);
  const finalChoices: Choice[] = [
    { text: `${variableSymbol} = ${solution}`, isCorrect: true, misconceptionTag: null },
    {
      text: `${variableSymbol} = ${-solution}`,
      isCorrect: false,
      misconceptionTag: "sign_error",
    },
    {
      text: `${variableSymbol} = ${rhs}`,
      isCorrect: false,
      misconceptionTag: "forgot_final_operation",
    },
  ];

  const finalRow: GridRow = {
    cells: assembleRow(variableSymbol, BLANK, renderConstant(solution), orientation),
    highlight: "success",
  };

  const stepOne: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepRow }],
    prompt,
    choices: shuffle(choices),
    explanationOnCorrect,
  };

  const stepTwo: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `${rhs} ${opSymbol} ${a} = ? What is the value of ${variableSymbol}?`,
    choices: shuffle(finalChoices),
    explanationOnCorrect: sameSign
      ? `${rhs} ${opSymbol} ${a} = ${computed}. Same signs give a positive result.`
      : `${rhs} ${opSymbol} ${a} = ${computed}. Different signs give a negative result.`,
  };

  return {
    initialRow,
    steps: [stepOne, stepTwo],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateOneStepInstance(): SolverInstance {
  const eq = generateOneStepEquation();
  return buildOneStepInstance(eq);
}
