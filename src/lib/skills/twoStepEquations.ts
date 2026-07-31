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

interface EquationInstance {
  a: number;
  b: number;
  form: VariableForm;
  variableFirst: boolean;
  orientation: Orientation;
  rhs: number;
  solution: number;
}

export function generateEquation(): EquationInstance {
  const form: VariableForm = randBool() ? "multiply" : "divide";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const variableFirst = randBool();
  const b = randInt(1, 20) * (randBool() ? 1 : -1);

  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round((a * x + b) * 100) / 100;
    return { a, b, form, variableFirst, orientation, rhs, solution: x };
  }

  const a = randInt(2, 9);
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  const rhs = k + b;
  return { a, b, form, variableFirst, orientation, rhs, solution: x };
}

export function buildSolverInstance(
  eq: EquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { a, b, form, variableFirst, orientation, rhs, solution } = eq;

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
    cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation),
  };

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
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(newRhs), orientation),
  };

  let stepBRow: GridRow;
  let stepBPrompt: string;
  let stepBChoices: Choice[];
  let stepBExplanation: string;

  if (form === "multiply") {
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `\\dfrac{${newRhs}}{${a}}`;
    const setupExpr1 = bIsSecond ? divSetup : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetup;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation) };
    stepBPrompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    stepBChoices = [
      { text: `Divide both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Multiply both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Divide both sides by ${Math.abs(b)}`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ];
    stepBExplanation = `Undo multiplication by dividing both sides by ${a}.`;
  } else {
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
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, multipliedConstant, orientation) };
    stepBPrompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    stepBChoices = [
      { text: `Multiply both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      {
        text: `Divide both sides by ${a}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: `Multiply both sides by ${Math.abs(b)}`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ];
    stepBExplanation = `Undo division by multiplying both sides by ${a}.`;
  }

  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(solution), orientation),
    highlight: "success",
  };

  const constantIsPositive = b >= 0;
  const stepAChoices: Choice[] = [
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

  const stepB: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepBRow }],
    prompt: stepBPrompt,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: stepBExplanation,
  };

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const computed = form === "multiply" ? newRhs / a : newRhs * a;
  const sameSign = (newRhs >= 0) === (a >= 0);
  const stepCChoices: Choice[] = [
    { text: `${variableSymbol} = ${solution}`, isCorrect: true, misconceptionTag: null },
    {
      text: `${variableSymbol} = ${-solution}`,
      isCorrect: false,
      misconceptionTag: "sign_error",
    },
    {
      text: `${variableSymbol} = ${newRhs}`,
      isCorrect: false,
      misconceptionTag: "forgot_final_operation",
    },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `${newRhs} ${opSymbol} ${a} = ? What is the value of ${variableSymbol}?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: sameSign
      ? `${newRhs} ${opSymbol} ${a} = ${computed}. Same signs give a positive result.`
      : `${newRhs} ${opSymbol} ${a} = ${computed}. Different signs give a negative result.`,
  };

  return {
    initialRow,
    steps: [stepA, stepB, stepC],
    eqColumnIndex: eqColumnIndexFor(orientation),
  };
}

export function generateTwoStepInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
