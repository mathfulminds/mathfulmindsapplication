// One-step equations whose numbers are fractions or decimals:
//   x + 2.5 = 7.1      x - 1/4 = 5/6      0.4x = 2.8
//   (2/3)x = 8         x/4 = 1.5          5x = 2  (fraction answer)
//
// Every kind follows the same steps and the same layout as the whole-number
// one-step skill (oneStepEquations.ts): choose the inverse operation, see it
// cancel (to 0 or to 1), then work out the value. The one new step is for
// adding/subtracting fractions with different denominators: before the
// final subtraction, the student picks the common denominator and the
// fractions are rewritten over it on their own line:
//
//   x + 1/4 = 5/6
//    -1/4    -1/4
//         x = 10/12 - 3/12
//         x = 7/12

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import type { Fraction } from "./fraction";
import { makeFraction, addFraction, subFraction, mulFraction, divFraction, negFraction, isInteger, fromInt } from "./fraction";
import {
  BLANK,
  Orientation,
  SIGN_GAP,
  assembleRow,
  eqColumnIndexFor,
  randBool,
  randInt,
  renderReciprocal,
  shuffle,
} from "./isolateVariableCore";

export type RationalMode = "fraction" | "decimal";
export type RationalKind = "add" | "mul" | "div";

export interface OneStepRationalProblem {
  mode: RationalMode;
  kind: RationalKind;
  // add: the constant next to the variable (signed). mul: the coefficient.
  // div: the whole-number divisor.
  k: Fraction;
  rhs: Fraction;
  variableFirst: boolean; // add only: "x + b" vs "b + x"
  orientation: Orientation;
}

// ---------- number formatting ----------

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

function terminates(f: Fraction): boolean {
  let d = f.den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

function decimalString(f: Fraction): string {
  const s = (Math.abs(f.num) / f.den).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return f.num < 0 ? `-${s}` : s;
}

// A value as it appears in the equation (KaTeX), in the problem's mode.
function K(f: Fraction, mode: RationalMode): string {
  if (mode === "decimal" && terminates(f)) return decimalString(f);
  if (f.den === 1) return `${f.num}`;
  return `${f.num < 0 ? "-" : ""}\\dfrac{${Math.abs(f.num)}}{${f.den}}`;
}
function Kabs(f: Fraction, mode: RationalMode): string {
  return K(f.num < 0 ? negFraction(f) : f, mode);
}
// With its sign written out in front ("+ 2.5", "- \dfrac{1}{4}").
function Ksigned(f: Fraction, mode: RationalMode, gap = true): string {
  return `${f.num < 0 ? "-" : "+"}${gap ? SIGN_GAP : ""}${Kabs(f, mode)}`;
}
// A value inside prompt/choice text: decimals as plain text, fractions as
// real KaTeX fractions.
function P(f: Fraction, mode: RationalMode): string {
  if ((mode === "decimal" && terminates(f)) || f.den === 1) return K(f, mode);
  return `$${K(f, mode)}$`;
}
function Pabs(f: Fraction, mode: RationalMode): string {
  return P(f.num < 0 ? negFraction(f) : f, mode);
}

function dedup(correct: string, candidates: { text: string; tag: string }[], count: number) {
  const seen = new Set([correct.replace(/\s+/g, "")]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === count) break;
    const key = c.text.replace(/\s+/g, "");
    if (seen.has(key) || /NaN|Infinity/.test(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function choicesWith(correct: string, wrong: { text: string; tag: string }[]): Choice[] {
  return shuffle<Choice>([
    { text: correct, isCorrect: true, misconceptionTag: null },
    ...wrong.map((w) => ({ text: w.text, isCorrect: false, misconceptionTag: w.tag })),
  ]);
}

// ---------- generator ----------

// (Coefficients ending in .5 are left to the whole-number one-step skill.)
const DECIMAL_COEFS = [0.2, 0.25, 0.3, 0.4, 0.6, 0.75, 0.8, 1.2, 1.25, 1.6, 2.4, 0.05];
const FRACTION_DENS = [2, 3, 4, 5, 6, 8, 10, 12];

function randDecimal(min: number, max: number): Fraction {
  // 1 or 2 decimal places, never a whole number.
  const places = Math.random() < 0.6 ? 1 : 2;
  const scale = places === 1 ? 10 : 100;
  let n = randInt(min * scale, max * scale);
  while (n % scale === 0 || (places === 2 && n % 10 === 0)) n = randInt(min * scale, max * scale);
  return makeFraction(n, scale);
}

function randProperFraction(): Fraction {
  const d = FRACTION_DENS[randInt(0, FRACTION_DENS.length - 1)];
  let n = randInt(1, d - 1);
  while (gcd(n, d) !== 1) n = randInt(1, d - 1);
  return makeFraction(n, d);
}

export function generateOneStepRational(mode: RationalMode): OneStepRationalProblem {
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const variableFirst = Math.random() < 0.75;
  const r = Math.random();

  if (mode === "decimal") {
    if (r < 0.5) {
      // x + b = c
      for (;;) {
        const x = randDecimal(0.1, 15);
        const b = mulFraction(randDecimal(0.1, 9.9), fromInt(randBool() ? 1 : -1));
        const c = addFraction(x, b);
        if (c.num <= 0 || isInteger(c)) continue;
        return { mode, kind: "add", k: b, rhs: c, variableFirst, orientation };
      }
    }
    if (r < 0.85) {
      // ax = c
      const a = DECIMAL_COEFS[randInt(0, DECIMAL_COEFS.length - 1)];
      const af = makeFraction(Math.round(a * 100), 100);
      const x = fromInt(randInt(2, 12));
      return { mode, kind: "mul", k: af, rhs: mulFraction(af, x), variableFirst: true, orientation };
    }
    // x/a = c
    const a = randInt(2, 9);
    const c = makeFraction(randInt(1, 19) * 5 + (randBool() ? 0 : 0), 10);
    const cc = isInteger(c) ? addFraction(c, makeFraction(1, 2)) : c;
    return { mode, kind: "div", k: fromInt(a), rhs: cc, variableFirst: true, orientation };
  }

  if (r < 0.6) {
    // x + b = c with fractions (different denominators most of the time)
    for (;;) {
      const x = randProperFraction();
      const b = mulFraction(randProperFraction(), fromInt(randBool() ? 1 : -1));
      const c = addFraction(x, b);
      if (c.num <= 0) continue;
      if (lcm(b.den, c.den) > 24) continue;
      return { mode, kind: "add", k: b, rhs: c, variableFirst, orientation };
    }
  }
  // (n/d)x = c, whole-number answer
  for (;;) {
    const d = randInt(2, 9);
    const n = randInt(1, 9);
    if (n === d || gcd(n, d) !== 1) continue;
    const x = d * randInt(1, 5);
    return { mode, kind: "mul", k: makeFraction(n, d), rhs: makeFraction(n * x, d), variableFirst: true, orientation };
  }
}

// ---------- builder ----------

export function buildOneStepRationalInstance(prob: OneStepRationalProblem, v: string = "x"): SolverInstance {
  if (prob.kind === "add") return buildAdditive(prob, v);
  if (prob.kind === "div") return buildDivide(prob, v);
  if (isInteger(prob.k) || prob.mode === "decimal" || prob.k.den === 1) return buildMultiplyByDividing(prob, v);
  return buildMultiplyByReciprocal(prob, v);
}

function buildAdditive(prob: OneStepRationalProblem, v: string): SolverInstance {
  const { mode, k: b, rhs: c, variableFirst, orientation } = prob;
  const solution = subFraction(c, b);
  const bAbs = b.num < 0 ? negFraction(b) : b;
  const positive = b.num > 0;

  const exprTerm1 = variableFirst ? v : K(b, mode);
  const exprTerm2 = variableFirst ? Ksigned(b, mode) : `+${SIGN_GAP}${v}`;
  const initialRow: GridRow = { cells: assembleRow(exprTerm1, exprTerm2, K(c, mode), orientation) };
  const initialRowMarked: GridRow = {
    cells: assembleRow(
      variableFirst ? exprTerm1 : `MARKEDTERM:${exprTerm1}`,
      variableFirst ? `MARKEDTERM:${exprTerm2}` : exprTerm2,
      K(c, mode),
      orientation
    ),
  };
  const cancelDisplay = Ksigned(negFraction(b), mode, false);
  const cancelRow: GridRow = {
    cells: assembleRow(variableFirst ? BLANK : cancelDisplay, variableFirst ? cancelDisplay : BLANK, cancelDisplay, orientation, ""),
  };
  const cancelRowMarked: GridRow = {
    cells: assembleRow(
      variableFirst ? BLANK : `MARKEDTERM:${cancelDisplay}`,
      variableFirst ? `MARKEDTERM:${cancelDisplay}` : BLANK,
      cancelDisplay,
      orientation,
      ""
    ),
  };
  const varAlone = (value: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleRow(variableFirst ? v : BLANK, variableFirst ? BLANK : v, value, orientation),
    ...(highlight ? { highlight } : {}),
  });

  const steps: SolverStep[] = [];
  const bP = Pabs(b, mode);
  steps.push({
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes the ${positive ? "+" : "-"}${bP} on the side with the variable?`,
    choices: shuffle<Choice>([
      { text: positive ? `Subtracting ${bP} from both sides` : `Adding ${bP} to both sides`, isCorrect: true, misconceptionTag: null },
      { text: `${positive ? "Dividing" : "Multiplying"} both sides by ${bP}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: positive ? `Adding ${bP} to both sides` : `Subtracting ${bP} from both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
    ]),
    explanationOnCorrect: positive
      ? `Undo addition by subtracting ${bP} from both sides.`
      : `Undo subtraction by adding ${bP} to both sides.`,
  });

  const opSym = positive ? "-" : "+";
  const cancelWrong = dedup("0", [
    { text: P(mulFraction(bAbs, fromInt(2)), mode), tag: "flipped_the_operation" },
    { text: bP, tag: "forgot_to_apply_operation" },
  ], 2);
  steps.push({
    stepId: "cancel_constant",
    rowUpdates: [
      { slotId: "__initial__", row: initialRowMarked },
      { slotId: "cancel_annotation", row: cancelRowMarked },
    ],
    prompt: `What is ${positive ? bP : `-${bP}`} ${opSym} ${bP}?`,
    choices: choicesWith("0", cancelWrong),
    explanationOnCorrect: "The two numbers are opposites, so they make 0.",
  });

  // ----- fractions over different denominators: rewrite first -----
  let computeLeft = c;
  let computeRight = bAbs;
  let rewritten = false;
  let lcd = 1;
  if (mode === "fraction" && c.den !== b.den) {
    rewritten = true;
    lcd = lcm(c.den, b.den);
    const cOver = `${c.num < 0 ? "-" : ""}\\dfrac{${Math.abs(c.num) * (lcd / c.den)}}{${lcd}}`;
    const bOver = `\\dfrac{${bAbs.num * (lcd / bAbs.den)}}{${lcd}}`;
    const rewriteCell = `${cOver} ${opSym === "-" ? "-" : "+"} ${bOver}`;
    const plainOver = (f: Fraction) => `$\\dfrac{${Math.abs(f.num) * (lcd / f.den)}}{${lcd}}$`;
    let prompt = "";
    let correct = "";
    let wrong: { text: string; tag: string }[] = [];
    let explanation = "";
    if (c.den === 1 || b.den === 1) {
      const whole = c.den === 1 ? c : bAbs;
      const other = c.den === 1 ? bAbs : c;
      prompt = `To ${positive ? "subtract" : "add"}, both numbers need the same denominator. How do you write ${Pabs(whole, mode)} as a fraction with a denominator of ${other.den}?`;
      correct = plainOver(whole);
      wrong = dedup(correct, [
        { text: `$\\dfrac{${Math.abs(whole.num)}}{${other.den}}$`, tag: "kept_whole_number_as_numerator" },
        { text: `$\\dfrac{${Math.abs(whole.num) + other.den}}{${other.den}}$`, tag: "added_instead_of_multiplied" },
        { text: `$\\dfrac{${Math.abs(whole.num) * other.den + 1}}{${other.den}}$`, tag: "arithmetic_slip" },
      ], 2);
      explanation = `${Pabs(whole, mode)} = ${correct}, since ${Math.abs(whole.num)} × ${other.den} = ${Math.abs(whole.num) * other.den}.`;
    } else {
      // Two fractions: find the least common denominator, then rewrite
      // each fraction over it, one question at a time.
      steps.push({
        stepId: "common_denominator",
        rowUpdates: [],
        prompt: `To ${positive ? "subtract" : "add"} these fractions, they need a common denominator. What is the least common denominator of ${c.den} and ${b.den}?`,
        choices: choicesWith(`${lcd}`, dedup(`${lcd}`, [
          { text: `${c.den + b.den}`, tag: "added_denominators" },
          { text: `${c.den * b.den}`, tag: "used_product_not_least" },
          { text: `${Math.max(c.den, b.den)}`, tag: "used_larger_denominator" },
          { text: `${lcd * 2}`, tag: "not_least" },
        ], 2)),
        explanationOnCorrect: `${lcd} is the smallest number both ${c.den} and ${b.den} divide into.`,
      });
      const convert = (f: Fraction, rowAfter: GridRow, id: string): SolverStep => {
        const num = Math.abs(f.num);
        const factor = lcd / f.den;
        const correctOver = `$\\dfrac{${num * factor}}{${lcd}}$`;
        return {
          stepId: id,
          rowUpdates: [{ slotId: "rewrite", row: rowAfter }],
          prompt: `What is ${Pabs(f, mode)} written with a denominator of ${lcd}?`,
          choices: choicesWith(correctOver, dedup(correctOver, [
            { text: `$\\dfrac{${num}}{${lcd}}$`, tag: "changed_only_the_denominator" },
            { text: `$\\dfrac{${num + (lcd - f.den)}}{${lcd}}$`, tag: "added_instead_of_multiplied" },
            { text: `$\\dfrac{${num * factor + 1}}{${lcd}}$`, tag: "arithmetic_slip" },
          ], 2)),
          explanationOnCorrect: `Multiply the top and bottom by ${factor}: ${Pabs(f, mode)} = ${correctOver}.`,
        };
      };
      // The second fraction's room is held (invisibly) until it's written,
      // so the first one never shifts when the second appears.
      const partial = `${cOver} \\phantom{${opSym === "-" ? "-" : "+"} ${bOver}}`;
      const cNeeds = c.den !== lcd;
      const bNeeds = bAbs.den !== lcd;
      if (cNeeds && bNeeds) {
        steps.push(convert(c, varAlone(partial), "rewrite_first_fraction"));
        steps.push(convert(bAbs, varAlone(rewriteCell), "rewrite_second_fraction"));
      } else if (cNeeds) {
        steps.push(convert(c, varAlone(rewriteCell), "rewrite_first_fraction"));
      } else {
        steps.push(convert(bAbs, varAlone(rewriteCell), "rewrite_second_fraction"));
      }
    }
    if (c.den === 1 || b.den === 1) {
      steps.push({
        stepId: "common_denominator",
        rowUpdates: [{ slotId: "rewrite", row: varAlone(rewriteCell) }],
        prompt,
        choices: choicesWith(correct, wrong),
        explanationOnCorrect: explanation,
      });
    }
    computeLeft = c;
    computeRight = bAbs;
  }

  // ----- the value -----
  const show = (f: Fraction) => (rewritten ? `$\\dfrac{${f.num * (lcd / f.den)}}{${lcd}}$`.replace("$\\dfrac{-", "$-\\dfrac{") : P(f, mode));
  const exprPrompt = `${show(computeLeft)} ${opSym === "-" ? "\u2212" : "+"} ${show(computeRight)}`;
  const correctText = `${v} = ${P(solution, mode)}`;
  const flipped = positive ? addFraction(c, bAbs) : subFraction(c, bAbs);
  const wrongCands: { text: string; tag: string }[] = [
    { text: `${v} = ${P(flipped, mode)}`, tag: "flipped_the_operation" },
  ];
  if (mode === "fraction" && rewritten) {
    // Adding or subtracting the denominators too.
    const numDiff = positive ? Math.abs(c.num) * (lcd / c.den) - bAbs.num * (lcd / bAbs.den) : Math.abs(c.num) * (lcd / c.den) + bAbs.num * (lcd / bAbs.den);
    wrongCands.push({ text: `${v} = $\\dfrac{${numDiff}}{${2 * lcd}}$`, tag: "combined_denominators" });
  } else if (mode === "fraction" && !isInteger(c)) {
    wrongCands.push({ text: `${v} = $\\dfrac{${Math.abs(solution.num * (c.den / solution.den))}}{${2 * c.den}}$`, tag: "combined_denominators" });
  }
  wrongCands.push({ text: `${v} = ${P(negFraction(solution), mode)}`, tag: "sign_error" });
  if (mode === "decimal") {
    wrongCands.push({ text: `${v} = ${P(addFraction(solution, makeFraction(1, 10)), mode)}`, tag: "arithmetic_slip" });
  }
  const unsimplified = rewritten && makeFraction(solution.num, solution.den).den !== lcd;
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "answer", row: varAlone(K(solution, mode), "success") }],
    prompt: `${exprPrompt} = ? What is the value of ${v}?`,
    choices: choicesWith(correctText, dedup(correctText, wrongCands, 2)),
    explanationOnCorrect:
      unsimplified && !isInteger(solution)
        ? `${exprPrompt} = $\\dfrac{${solution.num * (lcd / solution.den)}}{${lcd}}$, which simplifies to ${P(solution, mode)}.`
        : `${exprPrompt} = ${P(solution, mode)}.`,
  });

  return { initialRow, steps, eqColumnIndex: eqColumnIndexFor(orientation), termAlign: "right" };
}

// ax = c, where a is a decimal or a whole number (the answer may be a
// fraction or decimal): divide both sides by a, exactly like the
// whole-number one-step skill.
function buildMultiplyByDividing(prob: OneStepRationalProblem, v: string): SolverInstance {
  const { mode, k: a, rhs: c, orientation } = prob;
  const solution = divFraction(c, a);
  const aK = K(a, mode);
  const aP = P(a, mode);
  const varTerm = a.num === -1 && a.den === 1 ? `-${v}` : `${aK}${v}`;
  const initialRow: GridRow = { cells: assembleRow(varTerm, BLANK, K(c, mode), orientation) };
  const divRow: GridRow = { cells: assembleRow(`\\dfrac{${aK}${v}}{${aK}}`, BLANK, `\\dfrac{${K(c, mode)}}{${aK}}`, orientation) };
  const divRowMarked: GridRow = {
    cells: assembleRow(`MARKEDFRACTION:${aK}\u0006${v}\u0005${aK}`, BLANK, `\\dfrac{${K(c, mode)}}{${aK}}`, orientation),
  };
  const varAlone = (value: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleRow(v, BLANK, value, orientation),
    ...(highlight ? { highlight } : {}),
  });

  const steps: SolverStep[] = [];
  steps.push({
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "__initial__", row: divRow }],
    prompt: `What undoes multiplying ${v} by ${aP}?`,
    choices: shuffle<Choice>([
      { text: `Dividing both sides by ${aP}`, isCorrect: true, misconceptionTag: null },
      { text: `Multiplying both sides by ${aP}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: `Subtracting ${aP} from both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `Undo multiplication by dividing both sides by ${aP}.`,
  });
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: "__initial__", row: divRowMarked },
      { slotId: "coefficient_confirmed", row: varAlone(BLANK) },
    ],
    prompt: `What is ${aP} ÷ ${aP}?`,
    choices: choicesWith("1", dedup("1", [
      { text: aP, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    ], 2)),
    explanationOnCorrect: `${aP} divided by itself is 1, so ${v} is alone.`,
  });

  const correct = `${v} = ${P(solution, mode)}`;
  const wrong: { text: string; tag: string }[] = [
    { text: `${v} = ${P(mulFraction(c, a), mode)}`, tag: "multiplied_instead_of_divided" },
  ];
  if (mode === "decimal" && !isInteger(a)) {
    wrong.push({ text: `${v} = ${P(divFraction(solution, fromInt(10)), mode)}`, tag: "misplaced_decimal_point" });
    wrong.push({ text: `${v} = ${P(mulFraction(solution, fromInt(10)), mode)}`, tag: "misplaced_decimal_point" });
  }
  wrong.push({ text: `${v} = ${P(divFraction(a, c), mode)}`, tag: "divided_in_wrong_order" });
  wrong.push({ text: `${v} = ${P(negFraction(solution), mode)}`, tag: "sign_error" });
  const cP = P(c, mode);
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: varAlone(K(solution, mode), "success") }],
    prompt: `${cP} ÷ ${aP} = ? What is the value of ${v}?`,
    choices: choicesWith(correct, dedup(correct, wrong, 2)),
    explanationOnCorrect: `${cP} ÷ ${aP} = ${P(solution, mode)}.`,
  });
  return { initialRow, steps, eqColumnIndex: eqColumnIndexFor(orientation), termAlign: "right" };
}

// (n/d)x = c: multiply both sides by the reciprocal, like the fractional
// coefficients skill.
function buildMultiplyByReciprocal(prob: OneStepRationalProblem, v: string): SolverInstance {
  const { mode, k: a, rhs: c, orientation } = prob;
  const solution = divFraction(c, a);
  const coefTerm = `${a.num < 0 ? "-" : ""}\\dfrac{${Math.abs(a.num)}}{${a.den}}${v}`;
  const recip = renderReciprocal(a.num, a.den);
  const recipF = makeFraction(a.den, a.num);
  const initialRow: GridRow = { cells: assembleRow(coefTerm, BLANK, K(c, mode), orientation) };
  const exprLeft = orientation === "expressionLeft";
  const multVar = exprLeft ? `(${recip})${coefTerm}` : `${coefTerm}(${recip})`;
  const multConst = exprLeft ? `(${K(c, mode)})(${recip})` : `(${recip})(${K(c, mode)})`;
  const recipRow: GridRow = { cells: assembleRow(multVar, BLANK, multConst, orientation) };
  // Once confirmed to make 1, every number in the reciprocal pair is
  // crossed out in red, leaving just the variable.
  const sgn = a.num < 0 ? "-" : "";
  const markedVar = `MARKEDRECIP:${exprLeft ? "L" : "R"}\u0006${sgn}${a.den}\u0006${Math.abs(a.num)}\u0006${sgn}${Math.abs(a.num)}\u0006${a.den}\u0006${v}`;
  const recipRowMarked: GridRow = { cells: assembleRow(markedVar, BLANK, multConst, orientation) };
  const varAlone = (value: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleRow(v, BLANK, value, orientation),
    ...(highlight ? { highlight } : {}),
  });
  const aP = `$${coefTerm.slice(0, -v.length)}$`;
  const rP = `$${recip}$`;

  const steps: SolverStep[] = [];
  steps.push({
    stepId: "multiply_by_reciprocal",
    rowUpdates: [{ slotId: "__initial__", row: recipRow }],
    prompt: `What isolates ${v} when its coefficient is ${aP}?`,
    choices: shuffle<Choice>([
      { text: `Multiplying both sides by ${rP}`, isCorrect: true, misconceptionTag: null },
      { text: `Multiplying both sides by ${aP}`, isCorrect: false, misconceptionTag: "forgot_to_flip_reciprocal" },
      { text: `Subtracting ${aP} from both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `Multiply both sides by the reciprocal, ${rP}, since a fraction times its reciprocal equals 1.`,
  });
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: "__initial__", row: recipRowMarked },
      { slotId: "coefficient_confirmed", row: varAlone(BLANK) },
    ],
    prompt: `What is ${aP} × ${rP}?`,
    choices: choicesWith("1", dedup("1", [
      { text: aP, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: rP, tag: "left_answer_as_reciprocal" },
    ], 2)),
    explanationOnCorrect: `${aP} and ${rP} are reciprocals, so their product is 1, and ${v} is alone.`,
  });
  const correct = `${v} = ${P(solution, mode)}`;
  const cP = P(c, mode);
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: varAlone(K(solution, mode), "success") }],
    prompt: `${cP} × ${rP} = ? What is the value of ${v}?`,
    choices: choicesWith(correct, dedup(correct, [
      { text: `${v} = ${P(mulFraction(c, a), mode)}`, tag: "multiplied_by_coefficient_not_reciprocal" },
      { text: `${v} = ${P(negFraction(solution), mode)}`, tag: "sign_error" },
      { text: `${v} = ${P(mulFraction(c, makeFraction(recipF.num, 1)), mode)}`, tag: "forgot_to_divide_by_denominator" },
      { text: `${v} = ${P(c, mode)}`, tag: "forgot_final_operation" },
    ], 2)),
    explanationOnCorrect: `${cP} × ${rP} = ${P(solution, mode)}.`,
  });
  return { initialRow, steps, eqColumnIndex: eqColumnIndexFor(orientation), termAlign: "right" };
}

// x/a = c (a whole number, c a decimal): multiply both sides by a, like the
// whole-number one-step skill.
function buildDivide(prob: OneStepRationalProblem, v: string): SolverInstance {
  const { mode, k: aF, rhs: c, orientation } = prob;
  const a = aF.num;
  const solution = mulFraction(c, aF);
  const exprLeft = orientation === "expressionLeft";
  const initialRow: GridRow = { cells: assembleRow(`\\dfrac{${v}}{${a}}`, BLANK, K(c, mode), orientation) };
  const multVar = exprLeft ? `(${a})\\dfrac{${v}}{${a}}` : `\\dfrac{${v}}{${a}}(${a})`;
  const multConst = exprLeft ? `(${K(c, mode)})(${a})` : `(${a})(${K(c, mode)})`;
  const multRow: GridRow = { cells: assembleRow(multVar, BLANK, multConst, orientation) };
  const multRowMarked: GridRow = {
    cells: assembleRow(`MARKEDPARENFRACTION:${exprLeft ? "L" : "R"}\u0006${a}\u0006${v}\u0005${a}`, BLANK, multConst, orientation),
  };
  const varAlone = (value: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleRow(v, BLANK, value, orientation),
    ...(highlight ? { highlight } : {}),
  });
  const steps: SolverStep[] = [];
  steps.push({
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "__initial__", row: multRow }],
    prompt: `What undoes dividing ${v} by ${a}?`,
    choices: shuffle<Choice>([
      { text: `Multiplying both sides by ${a}`, isCorrect: true, misconceptionTag: null },
      { text: `Dividing both sides by ${a}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: `Adding ${a} to both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `Undo division by multiplying both sides by ${a}.`,
  });
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: "__initial__", row: multRowMarked },
      { slotId: "coefficient_confirmed", row: varAlone(BLANK) },
    ],
    prompt: `What is ${a} multiplied by $\\dfrac{1}{${a}}$?`,
    choices: choicesWith("1", dedup("1", [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
    ], 2)),
    explanationOnCorrect: `${a} and $\\dfrac{1}{${a}}$ are reciprocals, so their product is 1, and ${v} is alone.`,
  });
  const correct = `${v} = ${P(solution, mode)}`;
  const cP = P(c, mode);
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: varAlone(K(solution, mode), "success") }],
    prompt: `${cP} × ${a} = ? What is the value of ${v}?`,
    choices: choicesWith(correct, dedup(correct, [
      { text: `${v} = ${P(divFraction(c, aF), mode)}`, tag: "divided_instead_of_multiplied" },
      { text: `${v} = ${P(mulFraction(solution, fromInt(10)), mode)}`, tag: "misplaced_decimal_point" },
      { text: `${v} = ${P(negFraction(solution), mode)}`, tag: "sign_error" },
    ], 2)),
    explanationOnCorrect: `${cP} × ${a} = ${P(solution, mode)}.`,
  });
  return { initialRow, steps, eqColumnIndex: eqColumnIndexFor(orientation), termAlign: "right" };
}

export function generateOneStepRationalInstance(mode: RationalMode): SolverInstance {
  return buildOneStepRationalInstance(generateOneStepRational(mode));
}
