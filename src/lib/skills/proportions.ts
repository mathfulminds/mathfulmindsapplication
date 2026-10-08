// Proportions: a/b = c/d with one of the four numbers replaced by the
// variable. Solved by cross multiplying:
//
//   2/3 = x/24        (loops drawn around 2 & 24 and 3 & x)
//   2 · 24 = 3 · x
//   48/3 = 3x/3       (the 3s crossed out)
//   16 = x
//
// Cross products are always written top-left · bottom-right on the left
// and bottom-left · top-right on the right, so whichever side the variable
// ends up on, it stays on that side all the way down (like every other
// equation skill - "16 = x" is not flipped to "x = 16").

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randInt, shuffle } from "./isolateVariableCore";
import { makeFraction, fractionToKatex, isInteger } from "./fraction";

// Position of each number in the proportion.
export type ProportionPos = "TL" | "BL" | "TR" | "BR";

export interface ProportionProblem {
  // The four numbers, with the variable's position holding null.
  TL: number | null;
  BL: number | null;
  TR: number | null;
  BR: number | null;
}

const POSITIONS: ProportionPos[] = ["TL", "BL", "TR", "BR"];
// Each number is cross multiplied with the one diagonally across from it.
const DIAGONAL: Record<ProportionPos, ProportionPos> = { TL: "BR", BR: "TL", BL: "TR", TR: "BL" };

export function generateProportion(): ProportionProblem {
  // A ratio p/q and an equivalent one scaled by k; the variable replaces
  // one of the four numbers, so the answer is always a whole number.
  let p = randInt(1, 9);
  let q = randInt(2, 9);
  while (p === q) {
    p = randInt(1, 9);
    q = randInt(2, 9);
  }
  const k = randInt(2, 8);
  const small = { top: p, bottom: q };
  const big = { top: p * k, bottom: q * k };
  const smallLeft = Math.random() < 0.5;
  const left = smallLeft ? small : big;
  const right = smallLeft ? big : small;
  const prob: ProportionProblem = { TL: left.top, BL: left.bottom, TR: right.top, BR: right.bottom };
  const varPos = POSITIONS[randInt(0, 3)];
  prob[varPos] = null;
  return prob;
}

function variablePosition(prob: ProportionProblem): ProportionPos {
  const pos = POSITIONS.find((p) => prob[p] === null);
  if (!pos) throw new Error("A proportion needs exactly one variable.");
  return pos;
}

function dedup(correct: string, candidates: { text: string; tag: string }[], count: number) {
  const seen = new Set([correct.replace(/\s+/g, "")]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === count) break;
    const key = c.text.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function buildProportionInstance(prob: ProportionProblem, v: string = "x"): SolverInstance {
  const varPos = variablePosition(prob);
  const coef = prob[DIAGONAL[varPos]] as number; // what the variable gets multiplied by
  // The other two numbers multiply together into the known product.
  const [k1Pos, k2Pos] = POSITIONS.filter((p) => p !== varPos && p !== DIAGONAL[varPos]);
  const k1 = prob[k1Pos] as number;
  const k2 = prob[k2Pos] as number;
  // Keep the factors in reading order for the written products.
  const known = k1 * k2;
  const answer = makeFraction(known, coef);
  const answerKatex = fractionToKatex(answer);
  const answerPlain = isInteger(answer) ? `${answer.num}` : `$${answerKatex}$`;

  const show = (pos: ProportionPos) => (prob[pos] === null ? v : `${prob[pos]}`);
  const frac = (top: ProportionPos, bottom: ProportionPos) => `\\dfrac{${show(top)}}{${show(bottom)}}`;

  // The variable's product sits on the left when the variable is
  // top-left or bottom-right (the TL·BR diagonal).
  const varOnLeft = varPos === "TL" || varPos === "BR";
  const row = (left: string, right: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: [left, BLANK, "=", right],
    ...(highlight ? { highlight } : {}),
  });

  // Written in reading order: "2 · 24", "x · 24", "3 · x".
  const product = (a: ProportionPos, b: ProportionPos) => `${show(a)} \\cdot ${show(b)}`;
  const plainProduct = (a: ProportionPos, b: ProportionPos) => `${show(a)} · ${show(b)}`;
  const leftProduct = product("TL", "BR");
  const rightProduct = product("BL", "TR");

  const initialRow = row(frac("TL", "BL"), frac("TR", "BR"));
  const crossRow = row(leftProduct, rightProduct);

  const steps: SolverStep[] = [];

  // ---------- 1. Cross multiply ----------
  steps.push({
    stepId: "cross_multiply",
    rowUpdates: [{ slotId: "cross_products", row: crossRow }],
    prompt: "How do you start solving this proportion?",
    choices: shuffle<Choice>([
      {
        text: `Cross multiply: ${plainProduct("TL", "BR")} = ${plainProduct("BL", "TR")}`,
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: `Multiply straight across: ${plainProduct("TL", "TR")} = ${plainProduct("BL", "BR")}`,
        isCorrect: false,
        misconceptionTag: "multiplies_across_instead_of_cross",
      },
      {
        text: `Add across: ${show("TL")} + ${show("BR")} = ${show("BL")} + ${show("TR")}`,
        isCorrect: false,
        misconceptionTag: "adds_instead_of_multiplies",
      },
    ]),
    explanationOnCorrect: `In a proportion, the cross products are equal: ${plainProduct("TL", "BR")} = ${plainProduct("BL", "TR")}.`,
  });

  // ---------- 2. Multiply each side's pair, one side at a time ----------
  // In reading order (left side first). The side with the variable is
  // written with the number in front: "3 · x" becomes 3x, "x · 24" 24x.
  const knownProductPlain = `${k1} · ${k2}`;
  const varTerm = coef === 1 ? v : `${coef}${v}`;
  const varProductPlain = varOnLeft ? plainProduct("TL", "BR") : plainProduct("BL", "TR");
  const finalIfOne = coef === 1;
  const sideCells = (leftVal: string, rightVal: string, highlight?: GridRow["highlight"]): GridRow => row(leftVal, rightVal, highlight);
  const leftValue = varOnLeft ? varTerm : `${known}`;
  const rightValue = varOnLeft ? `${known}` : varTerm;
  const fullRow = finalIfOne ? sideCells(leftValue, rightValue, "success") : sideCells(leftValue, rightValue);
  const leftOnly: GridRow = { cells: [leftValue, BLANK, "", BLANK] };

  const knownStep = (rowAfter: GridRow): SolverStep => ({
    stepId: varOnLeft ? "multiply_right" : "multiply_left",
    rowUpdates: [{ slotId: "solve", row: rowAfter }],
    prompt: `What is ${knownProductPlain}?`,
    choices: shuffle<Choice>([
      { text: `${known}`, isCorrect: true, misconceptionTag: null },
      ...dedup(`${known}`, [
        { text: `${k1 + k2}`, tag: "adds_instead_of_multiplies" },
        { text: `${known - Math.min(k1, k2)}`, tag: "multiplication_slip" },
        { text: `${known + Math.min(k1, k2)}`, tag: "multiplication_slip" },
        { text: `${known + 10}`, tag: "multiplication_slip" },
      ], 2).map((d) => ({ text: d.text, isCorrect: false, misconceptionTag: d.tag })),
    ]),
    explanationOnCorrect: `${knownProductPlain} = ${known}.`,
  });
  const varStep = (rowAfter: GridRow): SolverStep => ({
    stepId: varOnLeft ? "multiply_left" : "multiply_right",
    rowUpdates: [{ slotId: "solve", row: rowAfter }],
    prompt: `What is ${varProductPlain}?`,
    choices: shuffle<Choice>([
      { text: `$${varTerm}$`, isCorrect: true, misconceptionTag: null },
      ...dedup(`$${varTerm}$`, [
        { text: coef === 1 ? `$1${v}$` : `$${coef} + ${v}$`, tag: coef === 1 ? "kept_coefficient_one" : "adds_instead_of_multiplies" },
        { text: `$${coef === 1 ? `1 + ${v}` : coef}$`, tag: coef === 1 ? "adds_instead_of_multiplies" : "dropped_the_variable" },
        { text: `$${v}$`, tag: "dropped_the_number" },
      ], 2).map((d) => ({ text: d.text, isCorrect: false, misconceptionTag: d.tag })),
    ]),
    explanationOnCorrect:
      coef === 1
        ? `1 · ${v} is just ${v}.`
        : `${varProductPlain} is written ${varTerm}, with the number in front of the variable.`,
  });
  // Left side first: its result appears on its own, then the full line.
  if (varOnLeft) {
    steps.push(varStep(leftOnly));
    steps.push(knownStep(fullRow));
  } else {
    steps.push(knownStep(leftOnly));
    steps.push(varStep(fullRow));
  }
  if (finalIfOne) {
    steps[steps.length - 1].explanationOnCorrect += ` So ${varOnLeft ? `${v} = ${known}` : `${known} = ${v}`}.`;
    return { initialRow, steps, eqColumnIndex: 2, termAlign: "right", crossLoops: { slotId: "__initial__", afterStepId: "cross_multiply" } };
  }

  // ---------- 3. Divide both sides by the coefficient ----------
  const divVar = `\\dfrac{${coef}${v}}{${coef}}`;
  const divKnown = `\\dfrac{${known}}{${coef}}`;
  const markedVar = `MARKEDFRACTION:${coef}\u0006${v}\u0005${coef}`;
  const divRow = varOnLeft ? row(divVar, divKnown) : row(divKnown, divVar);
  const divRowMarked = varOnLeft ? row(markedVar, divKnown) : row(divKnown, markedVar);
  steps.push({
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "solve", row: divRow }],
    prompt: `What undoes multiplying ${v} by ${coef}?`,
    choices: shuffle<Choice>([
      { text: `Dividing both sides by ${coef}`, isCorrect: true, misconceptionTag: null },
      { text: `Multiplying both sides by ${coef}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: `Subtracting ${coef} from both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `Undo multiplication by dividing both sides by ${coef}.`,
  });

  // ---------- 4. The coefficient becomes 1 ----------
  const varAlone = varOnLeft ? row(v, BLANK) : row(BLANK, v);
  const confirmDistractors = dedup("1", [
    { text: `${coef}`, tag: "forgot_to_apply_operation" },
    { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    { text: `${coef * coef}`, tag: "multiplied_instead_of_divided" },
  ], 2);
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: "solve", row: divRowMarked },
      { slotId: "answer", row: varAlone },
    ],
    prompt: `What is ${coef} ÷ ${coef}?`,
    choices: shuffle<Choice>([
      { text: "1", isCorrect: true, misconceptionTag: null },
      ...confirmDistractors.map((d) => ({ text: d.text, isCorrect: false, misconceptionTag: d.tag })),
    ]),
    explanationOnCorrect: `${coef} divided by itself is 1, so ${v} is alone.`,
  });

  // ---------- 5. Compute the value ----------
  const answerCell = answerKatex;
  const finalRow = varOnLeft ? row(v, answerCell, "success") : row(answerCell, v, "success");
  const wrong = (n: number, d: number) => {
    const f = makeFraction(n, d);
    return isInteger(f) ? `${f.num}` : `$${fractionToKatex(f)}$`;
  };
  const computeDistractors = dedup(`${v} = ${answerPlain}`, [
    { text: `${v} = ${known * coef}`, tag: "multiplied_instead_of_divided" },
    { text: `${v} = ${wrong(coef, known)}`, tag: "divided_in_wrong_order" },
    { text: `${v} = ${known - coef}`, tag: "subtracted_instead_of_divided" },
    { text: `${v} = ${isInteger(answer) ? answer.num + 1 : known + coef}`, tag: "arithmetic_slip" },
  ], 2);
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "answer", row: finalRow }],
    prompt: `${known} ÷ ${coef} = ? What is the value of ${v}?`,
    choices: shuffle<Choice>([
      { text: `${v} = ${answerPlain}`, isCorrect: true, misconceptionTag: null },
      ...computeDistractors.map((d) => ({ text: d.text, isCorrect: false, misconceptionTag: d.tag })),
    ]),
    explanationOnCorrect: isInteger(answer)
      ? `${known} ÷ ${coef} = ${answer.num}.`
      : `${known} ÷ ${coef} doesn't come out even, so the answer stays a fraction: ${answerPlain}.`,
  });

  return {
    initialRow,
    steps,
    eqColumnIndex: 2,
    termAlign: "right",
    crossLoops: { slotId: "__initial__", afterStepId: "cross_multiply" },
  };
}

export function generateProportionInstance(): SolverInstance {
  return buildProportionInstance(generateProportion());
}
