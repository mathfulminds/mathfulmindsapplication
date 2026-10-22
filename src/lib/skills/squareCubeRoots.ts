// Square and cube roots: x² = 49, x³ = -8, and the same with a number in
// front or added on (2x² + 3 = 53).
//
// Anything in front of / added to the x² is undone first with the existing
// One-Step / Two-Step builders (the "variable" is just x^2 there), so those
// steps look exactly like every other skill. Then:
//
//   square:  What undoes squaring x?  ->  take the square root of both sides
//            How many numbers squared give 49?  ->  two: 7 and -7, so ±
//            What is √49?  ->  7        x = ±7
//   cube:    What undoes cubing x?  ->  take the cube root of both sides
//            What is ∛(-8)?  ->  -2 (one answer: a cube root keeps the sign)
//
// Also handled when typed: x² = 0 (one answer), x² = negative (no real
// solution), fractions (x² = 9/16), and numbers that aren't perfect
// squares/cubes (the answer stays as a root: x = ±√20).

import type { SolverInstance, SolverStep, Choice, GridRow, PairedGridRow } from "./types";
import { BLANK, Orientation, randBool, randInt, shuffle } from "./isolateVariableCore";
import type { Fraction } from "./fraction";
import { fromInt, makeFraction } from "./fraction";
import { buildSolverInstance as buildTwoStep } from "./twoStepEquations";
import { buildOneStepInstance } from "./oneStepEquations";

export interface PowerProblem {
  n: 2 | 3;
  a: number; // a·x^n + b = rhs  (written in that order unless constantFirst)
  b: number;
  rhs: Fraction; // a fraction only when a = 1 and b = 0
  orientation: Orientation;
  constantFirst?: boolean; // "3 + x^2 = 12"
}

const fracTex = (f: Fraction) => (f.den === 1 ? `${f.num}` : `${f.num < 0 ? "-" : ""}\\dfrac{${Math.abs(f.num)}}{${f.den}}`);
const $ = (t: string) => `$${t}$`;

// exact n-th root of a whole number, or null
function intRoot(v: number, n: 2 | 3): number | null {
  if (n === 2 && v < 0) return null;
  const r = Math.round(Math.sign(v) * Math.pow(Math.abs(v), 1 / n));
  return Math.pow(r, n) === v ? r : null;
}
function fracRoot(f: Fraction, n: 2 | 3): Fraction | null {
  const p = intRoot(f.num, n);
  const q = intRoot(f.den, n);
  return p === null || q === null ? null : makeFraction(p, q);
}

function dedup(correct: string, wrong: { text: string; tag: string }[], n = 2): Choice[] {
  const seen = new Set([correct]);
  const out: Choice[] = [{ text: correct, isCorrect: true, misconceptionTag: null }];
  for (const w of wrong) {
    if (out.length > n) break;
    if (seen.has(w.text)) continue;
    seen.add(w.text);
    out.push({ text: w.text, isCorrect: false, misconceptionTag: w.tag });
  }
  return shuffle(out);
}

// "x^2" in plain prompt text reads as x² (KaTeX parts are left alone).
function prettyPowers(s: string): string {
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part) => (part.startsWith("$") ? part : part.replace(/([a-zA-Z])\^2/g, "$1²").replace(/([a-zA-Z])\^3/g, "$1³")))
    .join("");
}

export function buildPowerInstance(p: PowerProblem, v: string = "x"): SolverInstance {
  const { n, a, b, rhs, orientation } = p;
  const xn = `${v}^${n}`;
  const value: Fraction = a === 1 && b === 0 ? rhs : makeFraction(rhs.num - b * rhs.den, a * rhs.den); // x^n = value

  // ---------- undo what's around x^n (One-/Two-Step) ----------
  let initialRow: GridRow;
  let steps: SolverStep[] = [];
  let eqColumnIndex: number;
  let lastCells: string[];
  if (a === 1 && b === 0) {
    const cells = orientation === "expressionLeft" ? [xn, "=", fracTex(rhs)] : [fracTex(rhs), "=", xn];
    initialRow = { cells };
    eqColumnIndex = 1;
    lastCells = cells;
  } else {
    if (rhs.den !== 1 || value.den !== 1) throw new Error("power: whole numbers only when there's something to undo first");
    const inst =
      b === 0
        ? buildOneStepInstance(
            { variant: "multiplicative", a, b: 0, form: "multiply", variableFirst: true, orientation, rhs: rhs.num, solution: value.num } as Parameters<typeof buildOneStepInstance>[0],
            xn
          )
        : a === 1
        ? buildOneStepInstance(
            { variant: "additive", a: 1, b, form: "multiply", variableFirst: !p.constantFirst, orientation, rhs: rhs.num, solution: value.num } as Parameters<typeof buildOneStepInstance>[0],
            xn
          )
        : buildTwoStep(
            { a, b, form: "multiply", variableFirst: !p.constantFirst, orientation, rhs: rhs.num, solution: value.num } as Parameters<typeof buildTwoStep>[0],
            xn
          );
    initialRow = inst.initialRow as GridRow;
    eqColumnIndex = inst.eqColumnIndex;
    // their last line (x^n = value) is no longer the answer
    steps = inst.steps.map((st) => ({
      ...st,
      prompt: prettyPowers(st.prompt),
      explanationOnCorrect: prettyPowers(st.explanationOnCorrect),
      choices: st.choices.map((c) => ({ ...c, text: prettyPowers(c.text) })),
      rowUpdates: st.rowUpdates.map((u) => {
        const r = u.row as GridRow | PairedGridRow;
        if ("cells" in r && r.highlight === "success") {
          const { highlight: _h, ...rest } = r;
          return { ...u, row: rest };
        }
        return u;
      }),
    }));
    const finalRows = steps.flatMap((st) => st.rowUpdates.map((u) => u.row as GridRow)).filter((r) => r.cells.includes(xn));
    lastCells = [...finalRows[finalRows.length - 1].cells];
    const last = steps[steps.length - 1];
    last.explanationOnCorrect += ` Now ${$(xn)} is by itself.`;
  }

  // the x^n cell and the value cell in that last line
  const e = eqColumnIndex;
  const varCol = lastCells.indexOf(xn);
  const valCol = varCol < e ? lastCells.findIndex((c, i) => i > e && c !== BLANK) : lastCells.findIndex((c, i) => i < e && c !== BLANK);
  const line = (varTex: string, valTex: string, highlight?: GridRow["highlight"]): GridRow => {
    const c: string[] = lastCells.map((_x, i) => (i === e ? "=" : BLANK));
    c[varCol] = varTex;
    c[valCol] = valTex;
    return { cells: c, ...(highlight ? { highlight } : {}) };
  };
  const vTex = fracTex(value);
  // An invisible strut inside the root lifts the bar a little above an
  // exponent (√x² would otherwise touch the 2), and keeps the bars on both
  // sides of the = at the same height.
  const STRUT = "\\rule[-0.1em]{0pt}{1.15em}";
  const root = (t: string) => (n === 2 ? `\\sqrt{${t}${STRUT}}` : `\\sqrt[3]{${t}${STRUT}}`);

  if (n === 2) {
    // 1. undo the square
    steps.push({
      stepId: "goal_root",
      rowUpdates: [{ slotId: "root", row: line(root(xn), root(vTex)) }],
      prompt: `What undoes squaring ${$(v)}?`,
      choices: shuffle<Choice>([
        { text: "Taking the square root of both sides", isCorrect: true, misconceptionTag: null },
        { text: "Dividing both sides by 2", isCorrect: false, misconceptionTag: "thinks_square_means_times_two" },
        { text: "Taking the cube root of both sides", isCorrect: false, misconceptionTag: "wrong_root" },
      ]),
      explanationOnCorrect: `A square root undoes a square: ${$(root(xn))} is just ${$(v)}.`,
    });

    if (value.num < 0) {
      steps.push({
        stepId: "count_roots",
        rowUpdates: [{ slotId: "root_answer", row: { cells: [], caption: "No real solution", highlight: "success" } }],
        prompt: `Can you square a number and get ${$(vTex)}?`,
        choices: shuffle<Choice>([
          { text: "No - a number times itself is never negative", isCorrect: true, misconceptionTag: null },
          {
            text: (() => {
              const r = fracRoot({ num: -value.num, den: value.den }, 2);
              return r ? `Yes: ${$(`(-${fracTex(r)})^2 = ${vTex}`)}` : "Yes, if the number is negative";
            })(),
            isCorrect: false,
            misconceptionTag: "thinks_square_can_be_negative",
          },
        ]),
        explanationOnCorrect: `Positive × positive and negative × negative are both positive, so no real number squared gives ${$(vTex)}. There is no real solution.`,
      });
    } else if (value.num === 0) {
      steps.push({
        stepId: "compute_root",
        rowUpdates: [{ slotId: "root_answer", row: line(v, "0", "success") }],
        prompt: `What is ${$(root("0"))}?`,
        choices: dedup("0", [{ text: $("\\pm 1"), tag: "arithmetic_slip" }, { text: "1", tag: "arithmetic_slip" }]),
        explanationOnCorrect: `${$("0 \\times 0 = 0")}, and 0 is the only number that works (0 is neither positive nor negative), so ${$(`${v} = 0`)}.`,
      });
    } else {
      const r = fracRoot(value, 2);
      const rTex = r ? fracTex(r) : root(vTex);
      // 2. two answers
      const twoText = r ? `Two: ${$(rTex)} and ${$(`-${rTex}`)}` : `Two: ${$(root(vTex))} and ${$(`-${root(vTex)}`)}`;
      steps.push({
        stepId: "count_roots",
        rowUpdates: [{ slotId: "root", row: line(root(xn), `\\pm${root(vTex)}`) }],
        prompt: `How many numbers can you square to get ${$(vTex)}?`,
        choices: shuffle<Choice>([
          { text: twoText, isCorrect: true, misconceptionTag: null },
          { text: `One: ${$(r ? rTex : root(vTex))}`, isCorrect: false, misconceptionTag: "forgot_negative_root" },
          { text: "None", isCorrect: false, misconceptionTag: "no_roots" },
        ]),
        explanationOnCorrect: r
          ? `${$(`\\left(${rTex}\\right)^2 = ${vTex}`)} and ${$(`\\left(-${rTex}\\right)^2 = ${vTex}`)}, so both work. That's why we write ${$("\\pm")} (plus or minus).`
          : `A positive number squared and its negative squared give the same answer, so there are two. That's why we write ${$("\\pm")} (plus or minus).`,
      });
      // 3. the root itself
      if (r) {
        const half = value.den === 1 ? `${value.num / 2}` : null;
        const wrong = [
          ...(half && value.num % 2 === 0 ? [{ text: $(half), tag: "halves_instead_of_root" }] : []),
          { text: $(fracTex(makeFraction(value.num * value.num, value.den * value.den))), tag: "squares_instead_of_root" },
          { text: $(fracTex(makeFraction(r.num + r.den, r.den))), tag: "arithmetic_slip" },
        ];
        steps.push({
          stepId: "compute_root",
          rowUpdates: [{ slotId: "root_answer", row: line(v, `\\pm ${rTex}`, "success") }],
          prompt: `What is ${$(root(vTex))}?`,
          choices: dedup($(rTex), wrong),
          explanationOnCorrect: `${$(`${r.den === 1 ? rTex : `\\left(${rTex}\\right)`} \\times ${r.den === 1 ? rTex : `\\left(${rTex}\\right)`} = ${vTex}`)}, so ${$(`${root(vTex)} = ${rTex}`)}. So ${$(`${v} = ${rTex}`)} or ${$(`${v} = -${rTex}`)}.`,
        });
      } else {
        steps.push({
          stepId: "compute_root",
          rowUpdates: [{ slotId: "root_answer", row: line(v, `\\pm${root(vTex)}`, "success") }],
          prompt: `Is ${$(vTex)} a perfect square?`,
          choices: shuffle<Choice>([
            { text: `No, so the answer stays as ${$(root(vTex))}`, isCorrect: true, misconceptionTag: null },
            { text: `Yes: ${$(`${root(vTex)} = ${value.den === 1 && value.num % 2 === 0 ? value.num / 2 : Math.round(Math.sqrt(value.num / value.den))}`)}`, isCorrect: false, misconceptionTag: "treats_as_perfect_square" },
          ]),
          explanationOnCorrect: `No whole number squared is ${$(vTex)}, so we leave the answer as ${$(`${v} = \\pm${root(vTex)}`)} (about ${$(`\\pm ${(Math.sqrt(value.num / value.den)).toFixed(2)}`)}).`,
        });
      }
    }
  } else {
    // cube
    steps.push({
      stepId: "goal_root",
      rowUpdates: [{ slotId: "root", row: line(root(xn), root(vTex)) }],
      prompt: `What undoes cubing ${$(v)}?`,
      choices: shuffle<Choice>([
        { text: "Taking the cube root of both sides", isCorrect: true, misconceptionTag: null },
        { text: "Taking the square root of both sides", isCorrect: false, misconceptionTag: "wrong_root" },
        { text: "Dividing both sides by 3", isCorrect: false, misconceptionTag: "thinks_cube_means_times_three" },
      ]),
      explanationOnCorrect: `A cube root undoes a cube: ${$(root(xn))} is just ${$(v)}.`,
    });
    const r = fracRoot(value, 3);
    if (r) {
      const rTex = fracTex(r);
      const absR = fracTex({ num: Math.abs(r.num), den: r.den });
      const wrong = [
        ...(r.num !== 0 ? [{ text: $(`\\pm ${absR}`), tag: "thinks_cube_root_has_two_answers" }] : []),
        ...(r.num !== 0 ? [{ text: $(fracTex({ num: -r.num, den: r.den })), tag: "sign_error" }] : []),
        ...(value.den === 1 && value.num % 3 === 0 ? [{ text: $(`${value.num / 3}`), tag: "divides_by_three" }] : []),
        { text: $(fracTex(makeFraction(r.num + r.den, r.den))), tag: "arithmetic_slip" },
      ];
      const cube = r.den === 1 ? rTex : `\\left(${rTex}\\right)`;
      steps.push({
        stepId: "compute_root",
        rowUpdates: [{ slotId: "root_answer", row: line(v, rTex, "success") }],
        prompt: `What is ${$(root(vTex))}?`,
        choices: dedup($(rTex), wrong),
        explanationOnCorrect:
          r.num < 0
            ? `${$(`${cube.startsWith("\\left") ? cube : `(${cube})`}^3 = ${vTex}`)}. A cube root has just one answer, and it keeps the sign - a negative number cubed is negative.`
            : `${$(`${cube}^3 = ${vTex}`)}. A cube root has just one answer (a negative number cubed would be negative).`,
      });
    } else {
      steps.push({
        stepId: "compute_root",
        rowUpdates: [{ slotId: "root_answer", row: line(v, root(vTex), "success") }],
        prompt: `Is ${$(vTex)} a perfect cube?`,
        choices: shuffle<Choice>([
          { text: `No, so the answer stays as ${$(root(vTex))}`, isCorrect: true, misconceptionTag: null },
          { text: `Yes: ${$(`${root(vTex)} = ${Math.round(value.num / value.den / 3)}`)}`, isCorrect: false, misconceptionTag: "treats_as_perfect_cube" },
        ]),
        explanationOnCorrect: `No whole number cubed is ${$(vTex)}, so we leave the answer as ${$(`${v} = ${root(vTex)}`)} (about ${$(Math.cbrt(value.num / value.den).toFixed(2))}).`,
      });
    }
  }

  return { initialRow, steps, eqColumnIndex };
}

// ---------- practice problems ----------
export function generatePowerProblem(): PowerProblem {
  const n: 2 | 3 = Math.random() < 0.62 ? 2 : 3;
  const orientation: Orientation = Math.random() < 0.8 ? "expressionLeft" : "expressionRight";
  const root = n === 2 ? randInt(1, 12) : randInt(1, 5) * (randBool() ? 1 : -1);
  const value = Math.pow(root, n);
  const shape = Math.random();
  if (shape < 0.08 && n === 2) {
    // a fraction: x^2 = 9/16
    const p = randInt(1, 5);
    let q = randInt(2, 7);
    while (q === p) q = randInt(2, 7);
    return { n, a: 1, b: 0, rhs: makeFraction(p * p, q * q), orientation };
  }
  if (shape < 0.6) return { n, a: 1, b: 0, rhs: fromInt(value), orientation };
  if (shape < 0.75) {
    const a = randInt(2, n === 2 ? 5 : 3);
    return { n, a, b: 0, rhs: fromInt(a * value), orientation };
  }
  if (shape < 0.88) {
    const b = randInt(1, 20) * (randBool() ? 1 : -1);
    return { n, a: 1, b, rhs: fromInt(value + b), orientation, constantFirst: Math.random() < 0.25 };
  }
  const a = randInt(2, n === 2 ? 4 : 2);
  const b = randInt(1, 15) * (randBool() ? 1 : -1);
  return { n, a, b, rhs: fromInt(a * value + b), orientation };
}

export function generatePowerInstance(): SolverInstance {
  return buildPowerInstance(generatePowerProblem());
}
