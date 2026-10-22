// Inequalities with the variable on both sides, e.g. 5x - 3 < 2x + 9.
//
// Same steps and layout as Variables on Both Sides (variablesBothSides.ts):
// move the right side's variable term left, then the left side's constant
// right, then divide - plus the inequality skills' own steps: a "Does the
// inequality sign flip here?" check after each operation (the new line
// appears with just its symbol, as in Two-Step Inequalities), "What number
// completes the inequality?" for the value, and graphing the answer on a
// number line at the end. The variable always ends on the left, so the
// answer never needs its sides swapped.

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, assembleBothSides, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle, divNumerator } from "./isolateVariableCore";
import {
  ComparisonSymbol,
  randomSymbol,
  flipSymbol,
  plainSymbol,
  isInclusive,
  symbolDirection,
  symbolFromDirectionInclusive,
  graphChoiceText,
} from "./inequalityCore";

export interface BothSidesInequality {
  aLeft: number; // kept on the left
  aRight: number; // moved off the right first
  bLeft: number;
  bRight: number;
  symbol: ComparisonSymbol;
  boundary: number;
}

export function generateBothSidesInequality(): BothSidesInequality {
  let aLeft = randInt(2, 9) * (randBool() ? 1 : -1);
  let aRight = randInt(2, 9) * (randBool() ? 1 : -1);
  while (aLeft === aRight) aRight = randInt(2, 9) * (randBool() ? 1 : -1);
  // About 1 in 5: like 2x + 18 < x - 27, where the variable ends up as just
  // x - nothing to divide by, so the steps stop after the constants.
  if (Math.random() < 0.2) {
    aLeft = randInt(2, 9);
    aRight = aLeft - 1;
  }
  let bLeft = randInt(-20, 20);
  while (bLeft === 0) bLeft = randInt(-20, 20);
  for (;;) {
    let boundary = randInt(-12, 12);
    while (boundary === 0) boundary = randInt(-12, 12);
    const bRight = (aLeft - aRight) * boundary + bLeft;
    if (bRight === 0) continue;
    return { aLeft, aRight, bLeft, bRight, symbol: randomSymbol(randInt), boundary };
  }
}

const plainSignedConst = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
// "x" rather than "1x" whenever the number is 1.
const absTerm = (n: number, x: string) => (n === 1 ? x : `${n}${x}`);
const plainSignedTerm = (c: number, x: string) => `${c >= 0 ? "+" : "-"}${absTerm(Math.abs(c), x)}`;
const plainTerm = (c: number, x: string) => (c === 0 ? "0" : c === 1 ? x : c === -1 ? `-${x}` : `${c}${x}`);

function dedup(correct: string, candidates: { text: string; tag: string }[]) {
  const seen = new Set([correct]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === 2) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

function withCorrect(correct: string, wrong: { text: string; tag: string }[]): Choice[] {
  return shuffle<Choice>([
    { text: correct, isCorrect: true, misconceptionTag: null },
    ...wrong.map((w) => ({ text: w.text, isCorrect: false, misconceptionTag: w.tag })),
  ]);
}

function flipCheck(stepId: string, rowAfter: GridRow, slotId: string, willFlip: boolean, why: string): SolverStep {
  return {
    stepId,
    rowUpdates: [{ slotId, row: rowAfter }],
    prompt: why ? `Does the inequality sign flip here? (${why})` : "Does the inequality sign flip here?",
    choices: shuffle<Choice>([
      { text: willFlip ? "Yes, the sign flips" : "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      {
        text: willFlip ? "No, the sign stays the same" : "Yes, the sign flips",
        isCorrect: false,
        misconceptionTag: willFlip ? "forgot_to_flip_sign" : "flipped_when_not_needed",
      },
    ]),
    explanationOnCorrect: "",
  };
}

export function buildBothSidesInequalityInstance(ineq: BothSidesInequality, x: string = "x"): SolverInstance {
  const { aLeft, aRight, bLeft, bRight, symbol, boundary } = ineq;
  const sym = symbol;
  const row = (l1: string, l2: string, r1: string, r2: string, s: string = sym, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleBothSides(l1, l2, r1, r2, s),
    ...(highlight ? { highlight } : {}),
  });

  const initialRow = row(renderMultiplyTerm(aLeft, x), renderConstant(bLeft, true), renderMultiplyTerm(aRight, x), renderConstant(bRight, true));
  const initialRowMarked = row(
    renderMultiplyTerm(aLeft, x),
    renderConstant(bLeft, true),
    `MARKEDTERM:${renderMultiplyTerm(aRight, x)}`,
    renderConstant(bRight, true)
  );

  const steps: SolverStep[] = [];

  // ---------- Phase 1: the variable term moves to the left ----------
  const opAbs = Math.abs(aRight);
  const opSym = aRight >= 0 ? "-" : "+";
  const newA = aLeft - aRight;
  const cancelVar = renderMultiplyTerm(-aRight, x, true, false);
  const cancelVarRow = row(cancelVar, BLANK, cancelVar, BLANK, "");
  const cancelVarRowMarked = row(cancelVar, BLANK, `MARKEDTERM:${cancelVar}`, BLANK, "");
  const aRightPositive = aRight >= 0;

  steps.push({
    stepId: "goal_variable_left",
    rowUpdates: [{ slotId: "cancel_var_annotation", row: cancelVarRow }],
    prompt: `Let's move the variable to the left side. What undoes ${plainSignedTerm(aRight, x)}?`,
    choices: shuffle<Choice>([
      { text: aRightPositive ? `Subtracting ${absTerm(opAbs, x)} from both sides` : `Adding ${absTerm(opAbs, x)} to both sides`, isCorrect: true, misconceptionTag: null },
      { text: aRightPositive ? `Adding ${absTerm(opAbs, x)} to both sides` : `Subtracting ${absTerm(opAbs, x)} from both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
      {
        text: bRight >= 0 ? `Subtracting ${Math.abs(bRight)} from both sides` : `Adding ${Math.abs(bRight)} to both sides`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ]),
    explanationOnCorrect: "In order to get the variable term on the left side, we have to undo the right side.",
  });

  const afterVarRow = row(renderMultiplyTerm(newA, x), renderConstant(bLeft, true), BLANK, renderConstant(bRight));
  const afterVarRowMarked = row(renderMultiplyTerm(newA, x), `MARKEDTERM:${renderConstant(bLeft, true)}`, BLANK, renderConstant(bRight));
  const afterVarSymbolOnly = row(BLANK, BLANK, BLANK, BLANK);

  const flip1 = flipCheck("sign_flip_check_variable", afterVarSymbolOnly, "after_var_elim", false, "");
  flip1.explanationOnCorrect = "Adding or subtracting the same thing on both sides never flips an inequality.";
  steps.push(flip1);

  steps.push({
    stepId: "cancel_variable_term",
    rowUpdates: [
      { slotId: "__initial__", row: initialRowMarked },
      { slotId: "cancel_var_annotation", row: cancelVarRowMarked },
    ],
    prompt: `What is ${opSym === "+" ? "-" : ""}${absTerm(opAbs, x)} ${opSym} ${absTerm(opAbs, x)}?`,
    choices: withCorrect("0", dedup("0", [
      { text: absTerm(2 * opAbs, x), tag: "flipped_the_operation" },
      { text: absTerm(opAbs, x), tag: "forgot_to_apply_operation" },
      { text: `-${absTerm(opAbs, x)}`, tag: "sign_error" },
    ])),
    explanationOnCorrect: `The ${absTerm(opAbs, x)} terms are opposites resulting in 0.`,
  });

  const combine1Correct = plainTerm(newA, x);
  steps.push({
    stepId: "combine_variable_term",
    rowUpdates: [{ slotId: "after_var_elim", row: afterVarRow }],
    prompt: `What is ${plainTerm(aLeft, x)} ${opSym} ${absTerm(opAbs, x)}?`,
    choices: withCorrect(combine1Correct, dedup(combine1Correct, [
      { text: plainTerm(opSym === "-" ? aLeft + opAbs : aLeft - opAbs, x), tag: "flipped_the_operation" },
      { text: plainTerm(-newA, x), tag: "sign_error" },
      { text: plainTerm(newA + 1, x), tag: "arithmetic_slip" },
    ])),
    explanationOnCorrect: `The terms combine to ${plainTerm(newA, x)}. The rest of the inequality gets brought down unchanged.`,
  });

  // ---------- Phase 2: the constant moves to the right ----------
  const op2Abs = Math.abs(bLeft);
  const op2Sym = bLeft >= 0 ? "-" : "+";
  const newRhs = bRight - bLeft;
  const cancelConst = renderConstant(-bLeft, true, false);
  const cancelConstRow = row(BLANK, cancelConst, BLANK, cancelConst, "");
  const cancelConstRowMarked = row(BLANK, `MARKEDTERM:${cancelConst}`, BLANK, cancelConst, "");
  const bLeftPositive = bLeft >= 0;

  steps.push({
    stepId: "goal_constant_right",
    rowUpdates: [{ slotId: "cancel_const_annotation", row: cancelConstRow }],
    prompt: `Let's move the constant to the right side. What undoes ${plainSignedConst(bLeft)}?`,
    choices: shuffle<Choice>([
      { text: bLeftPositive ? `Subtracting ${op2Abs} from both sides` : `Adding ${op2Abs} to both sides`, isCorrect: true, misconceptionTag: null },
      { text: `${bLeftPositive ? "Dividing" : "Multiplying"} both sides by ${op2Abs}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: bLeftPositive ? `Adding ${op2Abs} to both sides` : `Subtracting ${op2Abs} from both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
    ]),
    explanationOnCorrect: "In order to get the constant on the right side, we have to undo the left side.",
  });

  const needsDivide = newA !== 1;
  const afterConstRow = row(renderMultiplyTerm(newA, x), BLANK, BLANK, renderConstant(newRhs), sym, needsDivide ? undefined : "success");
  const flip2 = flipCheck("sign_flip_check_constant", row(BLANK, BLANK, BLANK, BLANK), "after_const_elim", false, "");
  flip2.explanationOnCorrect = "Adding or subtracting the same value from both sides never flips an inequality.";
  steps.push(flip2);

  steps.push({
    stepId: "cancel_constant",
    rowUpdates: [
      { slotId: "after_var_elim", row: afterVarRowMarked },
      { slotId: "cancel_const_annotation", row: cancelConstRowMarked },
    ],
    prompt: `What is ${op2Sym === "+" ? "-" : ""}${op2Abs} ${op2Sym} ${op2Abs}?`,
    choices: withCorrect("0", dedup("0", [
      { text: `${2 * op2Abs}`, tag: "flipped_the_operation" },
      { text: `${op2Abs}`, tag: "forgot_to_apply_operation" },
      { text: `${-op2Abs}`, tag: "sign_error" },
    ])),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  });

  steps.push({
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "after_const_elim", row: afterConstRow }],
    prompt: `What is ${bRight} ${op2Sym} ${op2Abs}?`,
    choices: withCorrect(`${newRhs}`, dedup(`${newRhs}`, [
      { text: `${op2Sym === "-" ? bRight + op2Abs : bRight - op2Abs}`, tag: "flipped_the_operation" },
      { text: `${-newRhs}`, tag: "sign_error" },
      { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
    ])),
    explanationOnCorrect: needsDivide
      ? `The terms combine to ${newRhs}. The rest of the inequality gets brought down unchanged.`
      : `The terms combine to ${newRhs}. Since the coefficient of ${x} is already 1, this is the final answer: ${x} ${plainSymbol(sym)} ${newRhs}.`,
  });

  // ---------- Phase 3: divide by the coefficient (flips if negative) ----------
  let finalSymbol = sym;
  if (needsDivide) {
    const willFlip = newA < 0;
    finalSymbol = willFlip ? flipSymbol(sym) : sym;
    const divRow = row(`\\dfrac{${divNumerator(newA, x)}}{${newA}}`, BLANK, BLANK, `\\dfrac{${newRhs}}{${newA}}`);
    const divRowMarked = row(`MARKEDFRACTION:${newA}\u0006${x}\u0005${newA}`, BLANK, BLANK, `\\dfrac{${newRhs}}{${newA}}`);

    steps.push({
      stepId: "eliminate_coefficient",
      rowUpdates: [{ slotId: "after_const_elim", row: divRow }],
      prompt: `What undoes multiplying ${x} by ${newA}?`,
      choices: shuffle<Choice>([
        { text: `Dividing both sides by ${newA}`, isCorrect: true, misconceptionTag: null },
        { text: `Multiplying both sides by ${newA}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
        { text: `Adding ${Math.abs(newA)} to both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      ]),
      explanationOnCorrect: `The coefficient ${newA} cancels when you divide both sides by ${newA}.`,
    });

    const flip3 = flipCheck("sign_flip_check_coefficient", row(BLANK, BLANK, BLANK, BLANK, finalSymbol), "coefficient_confirmed", willFlip, `dividing both sides by ${newA}`);
    flip3.explanationOnCorrect = willFlip
      ? `Multiplying or dividing both sides by a negative number (${newA}) flips the inequality sign.`
      : `${newA} is positive, so dividing both sides by it does not flip the inequality sign.`;
    steps.push(flip3);

    steps.push({
      stepId: "confirm_coefficient_one",
      rowUpdates: [
        { slotId: "after_const_elim", row: divRowMarked },
        { slotId: "coefficient_confirmed", row: row(x, BLANK, BLANK, BLANK, finalSymbol) },
      ],
      prompt: `What is ${newA} ÷ ${newA}?`,
      choices: withCorrect("1", dedup("1", [
        { text: `${newA}`, tag: "forgot_to_apply_operation" },
        { text: "0", tag: "confuses_division_with_subtraction_pattern" },
        { text: `${-newA}`, tag: "sign_error" },
      ])),
      explanationOnCorrect: `The coefficient ${newA} divided by itself is 1, so the variable is isolated.`,
    });

    const sameSign = newRhs >= 0 === newA >= 0;
    steps.push({
      stepId: "compute_value",
      rowUpdates: [{ slotId: "coefficient_confirmed", row: row(x, BLANK, BLANK, renderConstant(boundary), finalSymbol, "success") }],
      prompt: `${newRhs} ÷ ${newA} = ? What number completes the inequality?`,
      choices: withCorrect(`${boundary}`, dedup(`${boundary}`, [
        { text: `${-boundary}`, tag: "sign_error" },
        { text: `${newRhs}`, tag: "forgot_final_operation" },
        { text: `${boundary + 1}`, tag: "arithmetic_slip" },
      ])),
      explanationOnCorrect: sameSign
        ? `${newRhs} ÷ ${newA} = ${boundary}. Same signs give a positive result.`
        : `${newRhs} ÷ ${newA} = ${boundary}. Different signs give a negative result.`,
    });
  }

  // ---------- Graph the answer ----------
  const dir = symbolDirection(finalSymbol);
  const inc = isInclusive(finalSymbol);
  const otherDir = dir === "left" ? "right" : "left";
  steps.push({
    stepId: "graph_solution",
    rowUpdates: [],
    prompt: `Which number line shows ${x} ${plainSymbol(finalSymbol)} ${boundary}?`,
    choices: shuffle<Choice>([
      { text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, inc)), isCorrect: true, misconceptionTag: null },
      { text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, !inc)), isCorrect: false, misconceptionTag: "misreads_inequality_boundary" },
      { text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, inc)), isCorrect: false, misconceptionTag: "misreads_inequality_direction" },
      { text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, !inc)), isCorrect: false, misconceptionTag: "misreads_inequality_graph" },
    ]),
    explanationOnCorrect: `${inc ? "A closed" : "An open"} circle at ${boundary}, shaded to the ${dir}, matches ${x} ${plainSymbol(finalSymbol)} ${boundary}.`,
  });

  return { initialRow, steps, eqColumnIndex: 2, columnCount: 5, termAlign: "right" };
}

export function generateBothSidesInequalityInstance(): SolverInstance {
  return buildBothSidesInequalityInstance(generateBothSidesInequality());
}
