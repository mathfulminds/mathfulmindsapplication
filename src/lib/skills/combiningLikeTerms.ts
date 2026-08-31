import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
  BLANK,
  assembleRow3,
  randBool,
  randInt,
  renderConstant,
  renderMultiplyTerm,
  signedWord,
} from "./isolateVariableCore";

interface EquationInstance {
  a1: number; // first x-coefficient on the left
  a2: number; // second x-coefficient on the left, to be combined with a1
  b: number; // left side's constant
  c: number; // right side's constant
  solution: number;
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

  return { a1, a2, b, c, solution };
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
  const { a1, a2, b, c, solution } = eq;
  const x = variableSymbol;

  // eqColumnIndex is fixed at 3 for this whole instance (assembleRow3's "="
  // position) - every later row keeps using assembleRow3, with the second
  // term column permanently blank once the like terms are combined, since
  // every row in one instance shares the same grid shape.
  const initialRow: GridRow = {
    cells: assembleRow3(
      renderMultiplyTerm(a1, x),
      renderMultiplyTerm(a2, x, true),
      renderConstant(b, true),
      renderConstant(c, true)
    ),
  };

  // ---------- Step 1: combine the like terms ----------

  const combinedA = a1 + a2;
  const op2 = a2 >= 0 ? "+" : "-";
  const absA2 = Math.abs(a2);

  const combinedRow: GridRow = {
    cells: assembleRow3(plainTerm(combinedA, x), BLANK, renderConstant(b, true), renderConstant(c, true)),
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

  const cancelDisplay = renderConstant(-b, true, false);
  const cancelRow: GridRow = {
    cells: assembleRow3(BLANK, BLANK, cancelDisplay, cancelDisplay, ""),
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
  const reducedRow: GridRow = {
    cells: assembleRow3(plainTerm(combinedA, x), BLANK, BLANK, renderConstant(newRhs)),
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
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  };

  // ---------- Step 4: divide by the combined coefficient ----------

  const divSetup = `\\dfrac{${plainTerm(combinedA, x)}}{${combinedA}}`;
  const divRhs = `\\dfrac{${newRhs}}{${combinedA}}`;
  const divRow: GridRow = {
    cells: assembleRow3(divSetup, BLANK, BLANK, divRhs),
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

  // ---------- Step 5: compute the final value ----------

  const finalRow: GridRow = {
    cells: assembleRow3(x, BLANK, BLANK, renderConstant(solution)),
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
    rowUpdates: [{ slotId: "final", row: finalRow }],
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
    steps: [combine, goal, cancelConstant, divide, computeValue],
    eqColumnIndex: 3,
    termAlign: "right",
  };
}

export function generateCombiningLikeTermsInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
