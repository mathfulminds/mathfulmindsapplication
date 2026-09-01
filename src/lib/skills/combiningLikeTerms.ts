import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import type { Orientation } from "./isolateVariableCore";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm, signedWord } from "./isolateVariableCore";

interface EquationInstance {
  a1: number; // first x-coefficient on the expression side
  a2: number; // second x-coefficient on the expression side, to be combined with a1
  b: number; // expression side's constant
  c: number; // the lone constant on the other side
  solution: number;
  orientation: Orientation; // which side the expression (a1x + a2x + b) sits on
}

export function generateEquation(): EquationInstance {
  const a1 = randInt(2, 9) * (randBool() ? 1 : -1);
  let a2 = randInt(2, 9) * (randBool() ? 1 : -1);
  while (a1 + a2 === 0) a2 = randInt(2, 9) * (randBool() ? 1 : -1);

  let b = randInt(-20, 20);
  while (b === 0) b = randInt(-20, 20);

  let solution = randInt(-12, 12);
  while (solution === 0) solution = randInt(-12, 12);

  const c = (a1 + a2) * solution + b;
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";

  return { a1, a2, b, c, solution, orientation };
}

function plainTerm(coef: number, symbol: string): string {
  if (coef === 1) return symbol;
  if (coef === -1) return `-${symbol}`;
  return `${coef}${symbol}`;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

export function buildSolverInstance(
  eq: EquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { a1, a2, b, c, solution, orientation } = eq;
  const x = variableSymbol;

  // eqColumnIndex is fixed for this whole instance based on orientation -
  // 3 when the expression (a1x + a2x + b) is on the left (c sits alone on
  // the right), or 1 when it's mirrored (c sits alone on the left). Every
  // row keeps using this same oriented assembly, so the "=" always lands
  // in the same column throughout the whole problem.
  const eqColumnIndex = orientation === "expressionLeft" ? 3 : 1;

  // Places the expression side's 3 term columns and the lone constant
  // column according to orientation - the SAME semantic arguments
  // (which term is which) regardless of which physical side they land
  // on, so every row-building call below doesn't need its own
  // orientation branching.
  function assembleOriented(
    exprCell1: string,
    exprCell2: string,
    exprCell3: string,
    constantCell: string,
    eqSymbol: string = "="
  ): string[] {
    return orientation === "expressionLeft"
      ? [exprCell1, exprCell2, exprCell3, eqSymbol, constantCell]
      : [constantCell, eqSymbol, exprCell1, exprCell2, exprCell3];
  }

  // The lone constant (c) is always the sole term on its own side, so it
  // always renders naturally - never a forced "+" - regardless of which
  // physical side it lands on.
  const initialRow: GridRow = {
    cells: assembleOriented(
      renderMultiplyTerm(a1, x),
      renderMultiplyTerm(a2, x, true),
      renderConstant(b, true),
      renderConstant(c)
    ),
  };

  // ---------- Step 1: combine the like terms ----------

  const combinedA = a1 + a2;
  const op2 = a2 >= 0 ? "+" : "-";
  const absA2 = Math.abs(a2);

  const combinedRow: GridRow = {
    cells: assembleOriented(plainTerm(combinedA, x), BLANK, renderConstant(b, true), renderConstant(c)),
  };

  const combineCorrect = plainTerm(combinedA, x);
  const combineFlipValue = a1 - a2;
  const combineDistractors = dedupNumeric(combineCorrect, [
    { text: plainTerm(combineFlipValue, x), tag: "flipped_the_operation" },
    { text: plainTerm(combinedA + 1, x), tag: "arithmetic_slip" },
    { text: plainTerm(-combinedA, x), tag: "sign_error" },
  ]);

  const combine: SolverStep = {
    stepId: "combine_like_terms",
    rowUpdates: [{ slotId: "combined_terms", row: combinedRow }],
    prompt: `Combine the like terms. What is ${plainTerm(a1, x)} ${op2} ${absA2}${x}?`,
    choices: shuffle([
      { text: combineCorrect, isCorrect: true, misconceptionTag: null },
      { text: combineDistractors[0].text, isCorrect: false, misconceptionTag: combineDistractors[0].tag },
      { text: combineDistractors[1].text, isCorrect: false, misconceptionTag: combineDistractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${plainTerm(combinedA, x)}. The rest of the equation gets brought down unchanged.`,
  };

  // ---------- Step 2: undo the constant ----------

  const bPositive = b >= 0;
  const absB = Math.abs(b);
  const opSym = bPositive ? "-" : "+";

  // b's own column is a non-leading position everywhere else it appears
  // in this equation, so its annotation needs the same gap a real forced
  // term there would have. c's column is leading/only-term-on-its-side,
  // so it stays gap-free - matching the per-column rule established for
  // the other skills, rather than a blanket "no gap" that would
  // misalign with the real row.
  const cancelDisplayAtB = renderConstant(-b, true);
  const cancelDisplayAtC = renderConstant(-b, true, false);
  const cancelRow: GridRow = {
    cells: assembleOriented(BLANK, BLANK, cancelDisplayAtB, cancelDisplayAtC, ""),
  };

  const correctOpText = bPositive ? `Subtracting ${absB} from both sides` : `Adding ${absB} to both sides`;

  const goal: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes ${signedWord(b)} on the side with the variable?`,
    choices: shuffle([
      { text: correctOpText, isCorrect: true, misconceptionTag: null },
      {
        text: `${bPositive ? "Dividing" : "Multiplying"} both sides by ${absB}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: bPositive ? `Adding ${absB} to both sides` : `Subtracting ${absB} from both sides`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
    ]),
    explanationOnCorrect: "In order to isolate the variable term, we have to undo the constant.",
  };

  // ---------- Step 3: arithmetic - the constant cancels ----------

  const newRhs = c - b;

  // If the combined coefficient is already 1, dividing by it is a no-op -
  // "x = value" is already fully solved the moment this row appears, so
  // this becomes the final step instead of continuing into a redundant
  // "divide by 1" / "confirm 1 ÷ 1 = 1" pair. A coefficient of -1 still
  // needs the divide phase - flipping every sign is a real operation,
  // not a no-op, even though the magnitude is also 1.
  const needsDivide = combinedA !== 1;

  const reducedRow: GridRow = {
    cells: assembleOriented(plainTerm(combinedA, x), BLANK, BLANK, renderConstant(newRhs)),
    ...(needsDivide ? {} : { highlight: "success" as const }),
  };

  const cancelDistractors = dedupNumeric("0", [
    { text: `${2 * absB}`, tag: "flipped_the_operation" },
    { text: `${absB}`, tag: "forgot_to_apply_operation" },
  ]);

  const cancelConstant: SolverStep = {
    stepId: "cancel_constant",
    rowUpdates: [{ slotId: "reduced_equation", row: reducedRow }],
    prompt: `What is ${b} ${opSym} ${absB}?`,
    choices: shuffle([
      { text: "0", isCorrect: true, misconceptionTag: null },
      { text: cancelDistractors[0].text, isCorrect: false, misconceptionTag: cancelDistractors[0].tag },
      { text: cancelDistractors[1].text, isCorrect: false, misconceptionTag: cancelDistractors[1].tag },
    ]),
    explanationOnCorrect: needsDivide
      ? "The constants are opposites resulting in 0."
      : `The constants are opposites resulting in 0. Since the coefficient of ${x} is already 1, this is the final answer: ${x} = ${newRhs}.`,
  };

  // ---------- Step 4: divide by the combined coefficient ----------

  const divSetup = `\\dfrac{${plainTerm(combinedA, x)}}{${combinedA}}`;
  const divRhs = `\\dfrac{${newRhs}}{${combinedA}}`;
  const divRow: GridRow = {
    cells: assembleOriented(divSetup, BLANK, BLANK, divRhs),
  };

  const step4Choices: Choice[] =
    absB !== combinedA
      ? [
          { text: `Dividing both sides by ${combinedA}`, isCorrect: true, misconceptionTag: null },
          {
            text: `Multiplying both sides by ${combinedA}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          { text: `Dividing both sides by ${absB}`, isCorrect: false, misconceptionTag: "targets_wrong_term_first" },
        ]
      : [
          { text: `Dividing both sides by ${combinedA}`, isCorrect: true, misconceptionTag: null },
          {
            text: `Multiplying both sides by ${combinedA}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          {
            text: `Adding ${Math.abs(combinedA)} to both sides`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
        ];

  const divide: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "reduced_equation", row: divRow }],
    prompt: `What undoes multiplying ${x} by ${combinedA}?`,
    choices: shuffle(step4Choices),
    explanationOnCorrect: `The coefficient ${combinedA} cancels when you divide both sides by ${combinedA}.`,
  };

  // ---------- Step 5: confirm the coefficient becomes 1 ----------
  // A NEW line, not a continuation of the fraction line above - so the
  // fraction setup (e.g. "3x/3 = 21/3") stays visible permanently, and
  // this is a genuinely new piece of information (the variable is now
  // isolated). The right side stays blank here - it hasn't been computed
  // yet, so it isn't repeated a second time; compute_value fills it in
  // on this same line below.
  const coeffConfirmedRow: GridRow = {
    cells: assembleOriented(x, BLANK, BLANK, BLANK),
  };

  const coeffOneDistractors = dedupNumeric("1", [
    { text: `${combinedA}`, tag: "forgot_to_apply_operation" },
    { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    { text: `${-combinedA}`, tag: "sign_error" },
  ]);

  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: coeffConfirmedRow }],
    prompt: `What is ${combinedA} \u00f7 ${combinedA}?`,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: coeffOneDistractors[0].text, isCorrect: false, misconceptionTag: coeffOneDistractors[0].tag },
      { text: coeffOneDistractors[1].text, isCorrect: false, misconceptionTag: coeffOneDistractors[1].tag },
    ]),
    explanationOnCorrect: `The coefficient ${combinedA} divided by itself is 1, so the variable is isolated.`,
  };

  // ---------- Step 6: compute the final value ----------

  const finalRow: GridRow = {
    cells: assembleOriented(x, BLANK, BLANK, renderConstant(solution)),
    highlight: "success",
  };

  const sameSign = newRhs >= 0 === combinedA >= 0;
  const correctText = `${x} = ${solution}`;
  const finalDistractors = dedupNumeric(correctText, [
    { text: `${x} = ${-solution}`, tag: "sign_error" },
    { text: `${x} = ${newRhs}`, tag: "forgot_final_operation" },
    { text: `${x} = ${solution + 1}`, tag: "arithmetic_slip" },
    { text: `${x} = ${solution - 1}`, tag: "arithmetic_slip" },
  ]);

  const computeValue: SolverStep = {
    stepId: "compute_value",
    // Same slot as confirm_coefficient_one - fills in the answer on the
    // SAME line that already showed the isolated variable, rather than
    // starting yet another new line.
    rowUpdates: [{ slotId: "coefficient_confirmed", row: finalRow }],
    prompt: `${newRhs} \u00f7 ${combinedA} = ? What is the value of ${x}?`,
    choices: shuffle([
      { text: correctText, isCorrect: true, misconceptionTag: null },
      { text: finalDistractors[0].text, isCorrect: false, misconceptionTag: finalDistractors[0].tag },
      { text: finalDistractors[1].text, isCorrect: false, misconceptionTag: finalDistractors[1].tag },
    ]),
    explanationOnCorrect: sameSign
      ? `The quotient ${newRhs} \u00f7 ${combinedA} = ${solution}. Same signs give a positive result.`
      : `The quotient ${newRhs} \u00f7 ${combinedA} = ${solution}. Different signs give a negative result.`,
  };

  return {
    initialRow,
    steps: needsDivide
      ? [combine, goal, cancelConstant, divide, confirmCoefficientOne, computeValue]
      : [combine, goal, cancelConstant],
    eqColumnIndex,
    // Always genuinely 5 cells regardless of orientation - the shared
    // grid's default eqColumnIndex-based formula assumes eqColumnIndex=1
    // always means a 4-cell row (true for the older 2-term-per-side
    // skills), which undercounts this skill's 3-term expression side by
    // one column and wraps the last cell onto its own line.
    columnCount: 5,
    termAlign: "right",
  };
}

export function generateCombiningLikeTermsInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
