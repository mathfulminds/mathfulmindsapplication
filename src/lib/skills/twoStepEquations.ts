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
  const cancelDisplay = renderConstant(cancelValue, true, false);
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
  let coeffConfirmPrompt: string;
  let coeffConfirmExplanation: string;
  let coeffConfirmDistractorCandidates: { text: string; tag: string }[];

  if (form === "multiply") {
    const divSetup = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divRhs = `\\dfrac{${newRhs}}{${a}}`;
    const setupExpr1 = bIsSecond ? divSetup : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetup;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation) };
    stepBPrompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    // "Dividing both sides by |b|" collides with the correct choice when
    // |b| happens to equal a - a legitimate input this function must
    // handle (e.g. when called with externally-supplied coefficients, not
    // just its own generator's) even though its own generator never
    // produces that combination.
    stepBChoices =
      Math.abs(b) !== a
        ? [
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
          ]
        : [
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
    stepBExplanation = `Undo multiplication by dividing both sides by ${a}.`;
    coeffConfirmPrompt = `What is ${a} \u00f7 ${a}?`;
    coeffConfirmExplanation = `The coefficient ${a} divided by itself is 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
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
    stepBChoices =
      Math.abs(b) !== a
        ? [
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
          ]
        : [
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
    stepBExplanation = `Undo division by multiplying both sides by ${a}.`;
    coeffConfirmPrompt = `What is ${a} multiplied by 1/${a}?`;
    coeffConfirmExplanation = `${a} times its own reciprocal is 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
  }

  // ---------- Confirm the coefficient becomes 1 ----------
  // A NEW line, not a continuation of the divide/multiply-setup line
  // above - so that setup (e.g. "ax/a = newRhs/a") stays visible
  // permanently, and this becomes a new line below it. The constant's
  // own position stays blank here - it hasn't been computed yet, so it
  // isn't repeated a second time; compute_value fills it in below.
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const coeffConfirmedRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, BLANK, orientation),
  };
  const coeffConfirmDistractors = dedupNumeric("1", coeffConfirmDistractorCandidates);
  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: coeffConfirmedRow }],
    prompt: coeffConfirmPrompt,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: coeffConfirmDistractors[0].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[0].tag },
      { text: coeffConfirmDistractors[1].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[1].tag },
    ]),
    explanationOnCorrect: coeffConfirmExplanation,
  };

  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(solution), orientation),
    highlight: "success",
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
      text: `${constantIsPositive ? "Dividing" : "Multiplying"} both sides by ${absB}`,
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

  // Split into three granular steps (goal -> confirm cancellation ->
  // confirm the new value), matching the pattern already established in
  // variablesBothSides.ts, instead of jumping straight from "choose the
  // operation" to the fully-simplified row in one step.
  const goalConstant: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes ${signedWord(b)} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: constantIsPositive
      ? `Undo addition by subtracting ${absB} from both sides.`
      : `Undo subtraction by adding ${absB} to both sides.`,
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

  const combineConstDistractors = dedupNumeric(`${newRhs}`, [
    { text: `${constOpSym === "-" ? rhs + absB : rhs - absB}`, tag: "flipped_the_operation" },
    { text: `${-newRhs}`, tag: "sign_error" },
    { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
  ]);
  const combineConstant: SolverStep = {
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "simplified", row: combinedRow }],
    prompt: `What is ${rhs} ${constOpSym} ${absB}?`,
    choices: shuffle([
      { text: `${newRhs}`, isCorrect: true, misconceptionTag: null },
      { text: combineConstDistractors[0].text, isCorrect: false, misconceptionTag: combineConstDistractors[0].tag },
      { text: combineConstDistractors[1].text, isCorrect: false, misconceptionTag: combineConstDistractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${newRhs}. The rest of the equation gets brought down unchanged.`,
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
  const correctText = `${variableSymbol} = ${solution}`;
  const stepCCandidates: { text: string; tag: string }[] = [
    { text: `${variableSymbol} = ${-solution}`, tag: "sign_error" },
    { text: `${variableSymbol} = ${newRhs}`, tag: "forgot_final_operation" },
    { text: `${variableSymbol} = ${solution + 1}`, tag: "arithmetic_slip" },
    { text: `${variableSymbol} = ${solution - 1}`, tag: "arithmetic_slip" },
  ];
  const seenStepC = new Set([correctText]);
  const stepCDistractors: { text: string; tag: string }[] = [];
  for (const c of stepCCandidates) {
    if (stepCDistractors.length === 2) break;
    if (seenStepC.has(c.text)) continue;
    seenStepC.add(c.text);
    stepCDistractors.push(c);
  }
  const stepCChoices: Choice[] = [
    { text: correctText, isCorrect: true, misconceptionTag: null },
    { text: stepCDistractors[0].text, isCorrect: false, misconceptionTag: stepCDistractors[0].tag },
    { text: stepCDistractors[1].text, isCorrect: false, misconceptionTag: stepCDistractors[1].tag },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: finalRow }],
    prompt: `${newRhs} ${opSymbol} ${a} = ? What is the value of ${variableSymbol}?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: sameSign
      ? `${newRhs} ${opSymbol} ${a} = ${computed}. Same signs give a positive result.`
      : `${newRhs} ${opSymbol} ${a} = ${computed}. Different signs give a negative result.`,
  };

  return {
    initialRow,
    steps: [goalConstant, cancelConstant, combineConstant, stepB, confirmCoefficientOne, stepC],
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateTwoStepInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
