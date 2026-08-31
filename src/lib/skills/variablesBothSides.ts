import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, assembleBothSides, randBool, randInt, renderConstant, renderMultiplyTerm } from "./isolateVariableCore";

interface EquationInstance {
  aLeft: number; // left side's x-coefficient (always kept - variable stays left)
  aRight: number; // right side's x-coefficient (always eliminated first)
  bLeft: number;
  bRight: number;
  solution: number;
}

export function generateEquation(): EquationInstance {
  const aLeft = randInt(2, 9) * (randBool() ? 1 : -1);
  let aRight = randInt(2, 9) * (randBool() ? 1 : -1);
  while (aLeft === aRight) aRight = randInt(2, 9) * (randBool() ? 1 : -1);

  let bLeft = randInt(-20, 20);
  while (bLeft === 0) bLeft = randInt(-20, 20);

  let solution = randInt(-12, 12);
  while (solution === 0) solution = randInt(-12, 12);

  const bRight = (aLeft - aRight) * solution + bLeft;

  return { aLeft, aRight, bLeft, bRight, solution };
}

// Plain-text (non-LaTeX) signed term formatting for MCQ choice labels and
// prompts, which render as ordinary text, not through KaTeX.
function plainSignedConst(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
function plainSignedTerm(coef: number, symbol: string): string {
  const sign = coef >= 0 ? "+" : "-";
  return `${sign}${Math.abs(coef)}${symbol}`;
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

export function buildSolverInstance(
  eq: EquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { aLeft, aRight, bLeft, bRight, solution } = eq;
  const x = variableSymbol;

  const initialRow: GridRow = {
    cells: assembleBothSides(
      renderMultiplyTerm(aLeft, x),
      renderConstant(bLeft, true),
      renderMultiplyTerm(aRight, x),
      renderConstant(bRight, true)
    ),
  };

  // ---------- Phase 1: get the variable term onto the left only ----------

  const opAbs = Math.abs(aRight);
  const opSym = aRight >= 0 ? "-" : "+"; // undo +aRight by subtracting, undo -aRight by adding
  const newA = aLeft - aRight;

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

  const cancelVarDisplay = renderMultiplyTerm(-aRight, x, true, false);
  const cancelVarRow: GridRow = {
    cells: assembleBothSides(cancelVarDisplay, BLANK, cancelVarDisplay, BLANK, ""),
  };

  const aRightPositive = aRight >= 0;
  const correctOp1Text = aRightPositive
    ? `Subtracting ${opAbs}${x} from both sides`
    : `Adding ${opAbs}${x} to both sides`;

  const goal1: SolverStep = {
    stepId: "goal_variable_left",
    rowUpdates: [{ slotId: "cancel_var_annotation", row: cancelVarRow }],
    prompt: `Let's move the variable to the left side. What undoes ${plainSignedTerm(aRight, x)}?`,
    choices: shuffle([
      { text: correctOp1Text, isCorrect: true, misconceptionTag: null },
      {
        text: aRightPositive
          ? `Adding ${opAbs}${x} to both sides`
          : `Subtracting ${opAbs}${x} from both sides`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
      {
        text: bRight >= 0
          ? `Subtracting ${Math.abs(bRight)} from both sides`
          : `Adding ${Math.abs(bRight)} to both sides`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ]),
    explanationOnCorrect: "In order to get the variable term on the left side, we have to undo the right side.",
  };

  const cancel1Correct = "0";
  const cancel1Distractors = dedupNumeric(cancel1Correct, [
    { text: `${2 * opAbs}${x}`, tag: "flipped_the_operation" },
    { text: `${opAbs}${x}`, tag: "forgot_to_apply_operation" },
    { text: `-${opAbs}${x}`, tag: "sign_error" },
  ]);

  const cancel1: SolverStep = {
    stepId: "cancel_variable_term",
    // The +5x / +5x annotation already appeared when the goal question
    // above was answered - this step only tests the resulting arithmetic,
    // it doesn't reveal anything new on the equation side.
    rowUpdates: [],
    prompt: `What is ${opAbs}${x} ${opSym} ${opAbs}${x}?`,
    choices: shuffle([
      { text: cancel1Correct, isCorrect: true, misconceptionTag: null },
      { text: cancel1Distractors[0].text, isCorrect: false, misconceptionTag: cancel1Distractors[0].tag },
      { text: cancel1Distractors[1].text, isCorrect: false, misconceptionTag: cancel1Distractors[1].tag },
    ]),
    explanationOnCorrect: `The ${opAbs}${x} terms are opposites resulting in 0.`,
  };

  // Right side now has only its constant, so it's first-position there -
  // natural sign, not forced.
  const afterVarRow: GridRow = {
    cells: assembleBothSides(renderMultiplyTerm(newA, x), renderConstant(bLeft, true), BLANK, renderConstant(bRight)),
  };

  const combine1Correct = plainTerm(newA, x);
  const combine1FlipValue = opSym === "-" ? aLeft + opAbs : aLeft - opAbs;
  const combine1Distractors = dedupNumeric(combine1Correct, [
    { text: plainTerm(combine1FlipValue, x), tag: "flipped_the_operation" },
    { text: plainTerm(-newA, x), tag: "sign_error" },
    { text: plainTerm(newA + 1, x), tag: "arithmetic_slip" },
  ]);

  const combine1: SolverStep = {
    stepId: "combine_variable_term",
    rowUpdates: [{ slotId: "after_var_elim", row: afterVarRow }],
    prompt: `What is ${plainTerm(aLeft, x)} ${opSym} ${opAbs}${x}?`,
    choices: shuffle([
      { text: combine1Correct, isCorrect: true, misconceptionTag: null },
      { text: combine1Distractors[0].text, isCorrect: false, misconceptionTag: combine1Distractors[0].tag },
      { text: combine1Distractors[1].text, isCorrect: false, misconceptionTag: combine1Distractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${plainTerm(newA, x)}. The rest of the equation gets brought down unchanged.`,
  };

  // ---------- Phase 2: get the constant onto the right only ----------

  const op2Abs = Math.abs(bLeft);
  const op2Sym = bLeft >= 0 ? "-" : "+";
  const newRhs = bRight - bLeft;

  const cancelConstDisplay = renderConstant(-bLeft, true, false);
  const cancelConstRow: GridRow = {
    cells: assembleBothSides(BLANK, cancelConstDisplay, BLANK, cancelConstDisplay, ""),
  };

  const bLeftPositive = bLeft >= 0;
  const correctOp2Text = bLeftPositive
    ? `Subtracting ${op2Abs} from both sides`
    : `Adding ${op2Abs} to both sides`;

  const goal2: SolverStep = {
    stepId: "goal_constant_right",
    rowUpdates: [{ slotId: "cancel_const_annotation", row: cancelConstRow }],
    prompt: `Let's move the constant to the right side. What undoes ${plainSignedConst(bLeft)}?`,
    choices: shuffle([
      {
        text: correctOp2Text,
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: `${bLeftPositive ? "Dividing" : "Multiplying"} both sides by ${op2Abs}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: bLeftPositive
          ? `Adding ${op2Abs} to both sides`
          : `Subtracting ${op2Abs} from both sides`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
    ]),
    explanationOnCorrect: "In order to get the constant on the right side, we have to undo the left side.",
  };

  const cancel2Correct = "0";
  const cancel2Distractors = dedupNumeric(cancel2Correct, [
    { text: `${2 * op2Abs}`, tag: "flipped_the_operation" },
    { text: `${op2Abs}`, tag: "forgot_to_apply_operation" },
    { text: `${-op2Abs}`, tag: "sign_error" },
  ]);

  const cancel2: SolverStep = {
    stepId: "cancel_constant",
    // Same as the variable phase: the annotation already appeared when
    // the goal question above was answered.
    rowUpdates: [],
    prompt: `What is ${op2Abs} ${op2Sym} ${op2Abs}?`,
    choices: shuffle([
      { text: cancel2Correct, isCorrect: true, misconceptionTag: null },
      { text: cancel2Distractors[0].text, isCorrect: false, misconceptionTag: cancel2Distractors[0].tag },
      { text: cancel2Distractors[1].text, isCorrect: false, misconceptionTag: cancel2Distractors[1].tag },
    ]),
    explanationOnCorrect: `The constants are opposites resulting in 0.`,
  };

  // If the combined coefficient is already 1, dividing by it is a no-op -
  // "x = value" is already fully solved the moment this row appears, so
  // this becomes the final step instead of continuing into a redundant
  // "divide by 1" / "confirm 1 ÷ 1 = 1" pair. A coefficient of -1 still
  // needs the divide phase - flipping every sign is a real operation,
  // not a no-op, even though the magnitude is also 1.
  const needsDivide = newA !== 1;

  const afterConstRow: GridRow = {
    cells: assembleBothSides(renderMultiplyTerm(newA, x), BLANK, BLANK, renderConstant(newRhs)),
    ...(needsDivide ? {} : { highlight: "success" as const }),
  };

  const combine2Correct = `${newRhs}`;
  const combine2FlipValue = op2Sym === "-" ? bRight + op2Abs : bRight - op2Abs;
  const combine2Distractors = dedupNumeric(combine2Correct, [
    { text: `${combine2FlipValue}`, tag: "flipped_the_operation" },
    { text: `${-newRhs}`, tag: "sign_error" },
    { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
  ]);

  const combine2: SolverStep = {
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "after_const_elim", row: afterConstRow }],
    prompt: `What is ${bRight} ${op2Sym} ${op2Abs}?`,
    choices: shuffle([
      { text: combine2Correct, isCorrect: true, misconceptionTag: null },
      { text: combine2Distractors[0].text, isCorrect: false, misconceptionTag: combine2Distractors[0].tag },
      { text: combine2Distractors[1].text, isCorrect: false, misconceptionTag: combine2Distractors[1].tag },
    ]),
    explanationOnCorrect: needsDivide
      ? `The terms combine to ${newRhs}. The rest of the equation gets brought down unchanged.`
      : `The terms combine to ${newRhs}. Since the coefficient of ${x} is already 1, this is the final answer: ${x} = ${newRhs}.`,
  };

  // ---------- Phase 3: divide by the combined coefficient ----------

  const divSetup = `\\dfrac{${renderMultiplyTerm(newA, x)}}{${newA}}`;
  const divRhs = `\\dfrac{${newRhs}}{${newA}}`;
  const divRow: GridRow = {
    cells: assembleBothSides(divSetup, BLANK, BLANK, divRhs),
  };

  const step3Choices: Choice[] =
    Math.abs(bLeft) !== newA
      ? [
          { text: `Dividing both sides by ${newA}`, isCorrect: true, misconceptionTag: null },
          {
            text: `Multiplying both sides by ${newA}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          {
            text: `Dividing both sides by ${Math.abs(bLeft)}`,
            isCorrect: false,
            misconceptionTag: "targets_wrong_term_first",
          },
        ]
      : [
          { text: `Dividing both sides by ${newA}`, isCorrect: true, misconceptionTag: null },
          {
            text: `Multiplying both sides by ${newA}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          {
            text: `Adding ${Math.abs(newA)} to both sides`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
        ];

  const step3: SolverStep = {
    stepId: "eliminate_coefficient",
    // Replaces the phase-2 result in place: this is the SAME equation
    // being progressively divided, not a new operation on a new term, so
    // it evolves the existing line rather than adding another below it.
    rowUpdates: [{ slotId: "after_const_elim", row: divRow }],
    prompt: `What undoes multiplying ${x} by ${newA}?`,
    choices: shuffle(step3Choices),
    explanationOnCorrect: `The coefficient ${newA} cancels when you divide both sides by ${newA}.`,
  };

  // ---------- Phase 4: confirm the coefficient becomes 1 ----------
  // A NEW line, not a continuation of the fraction line above - so the
  // fraction setup (e.g. "12x/12 = -84/12") stays visible permanently,
  // and this is a genuinely new piece of information (the variable is
  // now isolated), matching the same pattern used in the multi-step
  // no-parentheses skill. The right side stays blank here - it hasn't
  // been computed yet, so it isn't repeated a second time; compute_value
  // fills it in on this same line below.
  const coeffConfirmedRow: GridRow = {
    cells: assembleBothSides(x, BLANK, BLANK, BLANK),
  };

  const coeffOneDistractors = dedupNumeric("1", [
    { text: `${newA}`, tag: "forgot_to_apply_operation" },
    { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    { text: `${-newA}`, tag: "sign_error" },
  ]);

  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: coeffConfirmedRow }],
    prompt: `What is ${newA} \u00f7 ${newA}?`,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: coeffOneDistractors[0].text, isCorrect: false, misconceptionTag: coeffOneDistractors[0].tag },
      { text: coeffOneDistractors[1].text, isCorrect: false, misconceptionTag: coeffOneDistractors[1].tag },
    ]),
    explanationOnCorrect: `The coefficient ${newA} divided by itself is 1, so the variable is isolated.`,
  };

  // ---------- Phase 5: compute the final value ----------

  const finalRow: GridRow = {
    cells: assembleBothSides(x, BLANK, BLANK, renderConstant(solution)),
    highlight: "success",
  };

  const sameSign = newRhs >= 0 === newA >= 0;
  const correctText = `${x} = ${solution}`;
  const step4Candidates: { text: string; tag: string }[] = [
    { text: `${x} = ${-solution}`, tag: "sign_error" },
    { text: `${x} = ${newRhs}`, tag: "forgot_final_operation" },
    { text: `${x} = ${solution + 1}`, tag: "arithmetic_slip" },
    { text: `${x} = ${solution - 1}`, tag: "arithmetic_slip" },
  ];
  const step4Distractors = dedupNumeric(correctText, step4Candidates);

  const step4: SolverStep = {
    stepId: "compute_value",
    // Same slot as confirm_coefficient_one - fills in the answer on the
    // SAME line that already showed the isolated variable, rather than
    // starting yet another new line.
    rowUpdates: [{ slotId: "coefficient_confirmed", row: finalRow }],
    prompt: `${newRhs} \u00f7 ${newA} = ? What is the value of ${x}?`,
    choices: shuffle([
      { text: correctText, isCorrect: true, misconceptionTag: null },
      { text: step4Distractors[0].text, isCorrect: false, misconceptionTag: step4Distractors[0].tag },
      { text: step4Distractors[1].text, isCorrect: false, misconceptionTag: step4Distractors[1].tag },
    ]),
    explanationOnCorrect: sameSign
      ? `The quotient ${newRhs} \u00f7 ${newA} = ${solution}. Same signs give a positive result.`
      : `The quotient ${newRhs} \u00f7 ${newA} = ${solution}. Different signs give a negative result.`,
  };

  return {
    initialRow,
    steps: needsDivide
      ? [goal1, cancel1, combine1, goal2, cancel2, combine2, step3, confirmCoefficientOne, step4]
      : [goal1, cancel1, combine1, goal2, cancel2, combine2],
    eqColumnIndex: 2,
    columnCount: 5,
    termAlign: "right",
  };
}

export function generateVariablesBothSidesInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
