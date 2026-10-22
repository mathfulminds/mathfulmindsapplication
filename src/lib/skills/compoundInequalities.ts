// Compound inequalities. Two kinds of problem:
//
//   -3 < 2x + 1 <= 7          "sandwich" (an "and" written as one line):
//                             whatever is done to the middle is done to all
//                             three parts, so both signs flip together when
//                             dividing by a negative.
//
//   2x + 1 < 5  or  3x - 2 > 10      two inequalities joined by "or" (or
//                                    "and"): each one is solved on its own,
//                                    side by side on the same lines.
//
// Same steps and wording as the other inequality skills: undo the constant
// (with a "Does the inequality sign flip here?" check that reveals the next
// line with only its symbols), cancel, combine ("the rest gets brought down
// unchanged"), divide (flip check), coefficient becomes 1, "What number
// completes the inequality?", and finally graphing the answer on a number
// line - now with two endpoints.
//
// Layout: the first relation symbol is the anchor column (eqColumnIndex);
// the second symbol and the word "or"/"and" are ordinary cells, written as
// "connector" cells (\mkern1mu ... / \; ...) so the solver can space them
// like a relation and keep them in place when a line is divided.

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm, shuffle, divNumerator } from "./isolateVariableCore";
import { ComparisonSymbol, flipSymbol, isInclusive, plainSymbol, symbolDirection } from "./inequalityCore";

export interface InequalityPart {
  a: number; // a x + b  sym  rhs
  b: number;
  sym: ComparisonSymbol;
  rhs: number;
}

export type CompoundInequality =
  | { kind: "sandwich"; left: number; s1: ComparisonSymbol; a: number; b: number; s2: ComparisonSymbol; right: number }
  | { kind: "twoPart"; join: "and" | "or"; p1: InequalityPart; p2: InequalityPart };

// ---------- graph encoding ----------
// "GRAPH:{lo}|{hi}|{between|outside}|{loInclusive}|{hiInclusive}" - the
// five-field form of the GRAPH: protocol (the one-endpoint form has three).
export function compoundGraphText(lo: number, hi: number, shape: "between" | "outside", loInc: boolean, hiInc: boolean): string {
  return `GRAPH:${lo}|${hi}|${shape}|${loInc ? 1 : 0}|${hiInc ? 1 : 0}`;
}

// ---------- cell helpers ----------
// A relation symbol that isn't in the anchor column. The 1mu on each side,
// plus the grid's medium-space column gap, adds up to TeX's thick space -
// the same gap the anchor symbol gets.
export const REL = (s: ComparisonSymbol) => `\\mkern1mu${s}\\mkern1mu`;
export const JOIN = (j: "and" | "or") => `\\;\\text{${j}}\\;`;

const pc = (v: number) => `${v}`;
const signedConst = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
const plainTerm = (c: number, x: string) => (c === 1 ? x : c === -1 ? `-${x}` : `${c}${x}`);
const opWord = (v: number) => (v >= 0 ? "-" : "+");

export function dedup(correct: string, candidates: { text: string; tag: string }[], n = 2) {
  const seen = new Set([correct]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === n) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

export function withCorrect(correct: string, wrong: { text: string; tag: string }[]): Choice[] {
  return shuffle<Choice>([
    { text: correct, isCorrect: true, misconceptionTag: null },
    ...wrong.map((w) => ({ text: w.text, isCorrect: false, misconceptionTag: w.tag })),
  ]);
}

export function flipCheck(stepId: string, slotId: string, row: GridRow, willFlip: boolean, why: string, plural: boolean, explanation: string): SolverStep {
  const yes = plural ? "Yes, both signs flip" : "Yes, the sign flips";
  const no = plural ? "No, the signs stay the same" : "No, the sign stays the same";
  return {
    stepId,
    rowUpdates: [{ slotId, row }],
    prompt: why ? `Does the inequality sign flip here? (${why})` : "Does the inequality sign flip here?",
    choices: shuffle<Choice>([
      { text: willFlip ? yes : no, isCorrect: true, misconceptionTag: null },
      { text: willFlip ? no : yes, isCorrect: false, misconceptionTag: willFlip ? "forgot_to_flip_sign" : "flipped_when_not_needed" },
    ]),
    explanationOnCorrect: explanation,
  };
}

export function goalChoices(b: number, scope: string, wrongScope: string): Choice[] {
  const abs = Math.abs(b);
  const right = b >= 0 ? `Subtracting ${abs} from ${scope}` : `Adding ${abs} to ${scope}`;
  const flipped = b >= 0 ? `Adding ${abs} to ${scope}` : `Subtracting ${abs} from ${scope}`;
  const partial = b >= 0 ? `Subtracting ${abs} from ${wrongScope}` : `Adding ${abs} to ${wrongScope}`;
  return shuffle<Choice>([
    { text: right, isCorrect: true, misconceptionTag: null },
    { text: flipped, isCorrect: false, misconceptionTag: "flipped_the_operation" },
    { text: partial, isCorrect: false, misconceptionTag: wrongScope === "the middle only" ? "only_changed_middle" : "confuses_additive_and_multiplicative_inverse" },
  ]);
}

export function cancelStep(b: number, rowUpdates: SolverStep["rowUpdates"]): SolverStep {
  const abs = Math.abs(b);
  return {
    stepId: "cancel_constant",
    rowUpdates,
    prompt: `What is ${b >= 0 ? abs : -abs} ${opWord(b)} ${abs}?`,
    choices: withCorrect("0", dedup("0", [
      { text: `${2 * abs}`, tag: "flipped_the_operation" },
      { text: `${abs}`, tag: "forgot_to_apply_operation" },
      { text: `${-abs}`, tag: "sign_error" },
    ])),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  };
}

export function combinePrompt(value: number, b: number): { prompt: string; result: number; choices: Choice[] } {
  const abs = Math.abs(b);
  const result = value - b;
  return {
    prompt: `What is ${value} ${opWord(b)} ${abs}?`,
    result,
    choices: withCorrect(`${result}`, dedup(`${result}`, [
      { text: `${value + b}`, tag: "flipped_the_operation" },
      { text: `${-result}`, tag: "sign_error" },
      { text: `${result + 1}`, tag: "arithmetic_slip" },
    ])),
  };
}

export function divideChoices(a: number, scope: string, b: number): Choice[] {
  const wrong3 = Math.abs(b) !== Math.abs(a) && Math.abs(b) > 1
    ? { text: `Dividing ${scope} by ${Math.abs(b)}`, tag: "targets_wrong_term_first" }
    : { text: `Adding ${Math.abs(a)} to ${scope}`, tag: "confuses_additive_and_multiplicative_inverse" };
  return shuffle<Choice>([
    { text: `Dividing ${scope} by ${a}`, isCorrect: true, misconceptionTag: null },
    { text: `Multiplying ${scope} by ${a}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    { text: wrong3.text, isCorrect: false, misconceptionTag: wrong3.tag },
  ]);
}

export function coefficientOneStep(a: number, rowUpdates: SolverStep["rowUpdates"]): SolverStep {
  return {
    stepId: "confirm_coefficient_one",
    rowUpdates,
    prompt: `What is ${a} ÷ ${a}?`,
    choices: withCorrect("1", dedup("1", [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ])),
    explanationOnCorrect: `The coefficient ${a} divided by itself is 1, so the variable is isolated.`,
  };
}

export function computeStep(
  stepId: string,
  num: number,
  a: number,
  rowUpdates: SolverStep["rowUpdates"],
  suffix = "",
  question = "What number completes the inequality?"
): SolverStep {
  const value = num / a;
  const sameSign = num >= 0 === a >= 0;
  return {
    stepId,
    rowUpdates,
    prompt: `${num} ÷ ${a} = ? ${question}`,
    choices: withCorrect(`${value}`, dedup(`${value}`, [
      { text: `${-value}`, tag: "sign_error" },
      { text: `${num}`, tag: "forgot_final_operation" },
      { text: `${value + 1}`, tag: "arithmetic_slip" },
    ])),
    explanationOnCorrect:
      value === 0
        ? `${num} ÷ ${a} = 0.${suffix}`
        : `${num} ÷ ${a} = ${value}. ${sameSign ? "Same signs give a positive result." : "Different signs give a negative result."}${suffix}`,
  };
}

// ---------- the answer, as a graph ----------
interface Ray {
  value: number;
  dir: "left" | "right"; // x < value: left
  inc: boolean;
}

export type CompoundAnswer =
  | { shape: "between"; lo: number; hi: number; loInc: boolean; hiInc: boolean }
  | { shape: "outside"; lo: number; hi: number; loInc: boolean; hiInc: boolean };

// Combines two rays ("x > -1", "x <= 4") under "and"/"or". Returns null for
// the cases this skill doesn't graph: no solution, all real numbers, a single
// point, or two rays pointing the same way (which is just one ray).
export function combineRays(r1: Ray, r2: Ray, join: "and" | "or"): CompoundAnswer | null {
  if (r1.dir === r2.dir) return null;
  const left = r1.dir === "left" ? r1 : r2; // x < left.value
  const right = r1.dir === "right" ? r1 : r2; // x > right.value
  if (join === "and") {
    if (!(right.value < left.value)) return null;
    return { shape: "between", lo: right.value, hi: left.value, loInc: right.inc, hiInc: left.inc };
  }
  if (!(left.value < right.value)) return null;
  return { shape: "outside", lo: left.value, hi: right.value, loInc: left.inc, hiInc: right.inc };
}

// The two cases with no graph: "and" with nothing in common (no solution),
// and "or" that covers every number (all real numbers). null otherwise
// (including a single point, or every number but one).
export function emptyOrAll(r1: Ray, r2: Ray, join: "and" | "or"): "none" | "all" | null {
  if (r1.dir === r2.dir) return null;
  const left = r1.dir === "left" ? r1 : r2;
  const right = r1.dir === "right" ? r1 : r2;
  if (join === "and") {
    if (right.value > left.value) return "none";
    if (right.value === left.value && !(right.inc && left.inc)) return "none";
    return null;
  }
  if (left.value > right.value) return "all";
  if (left.value === right.value && (left.inc || right.inc)) return "all";
  return null;
}

// Both answers drawn as two rays on one number line: "GRAPH:{v1}|{v2}|rays|{inc1}|{inc2}|{L|R}{L|R}". Used when there's no
// solution or every number works, so students can SEE the rays miss each
// other (or cover the whole line).
export function raysGraphText(r1: { value: number; dir: "left" | "right"; inc: boolean }, r2: { value: number; dir: "left" | "right"; inc: boolean }): string {
  const d = (r: { dir: string }) => (r.dir === "left" ? "L" : "R");
  return `GRAPH:${r1.value}|${r2.value}|rays|${r1.inc ? 1 : 0}|${r2.inc ? 1 : 0}|${d(r1)}${d(r2)}`;
}

function raysGraphStep(kind: "none" | "all", rays: { value: number; dir: "left" | "right"; inc: boolean }[], statement: string): SolverStep {
  const [r1, r2] = rays;
  const flipDir = (r: typeof r1) => ({ ...r, dir: r.dir === "left" ? ("right" as const) : ("left" as const) });
  const flipInc = (r: typeof r1) => ({ ...r, inc: !r.inc });
  const lo = Math.min(r1.value, r2.value);
  const hi = Math.max(r1.value, r2.value);
  const wrong = [
    { text: raysGraphText(flipInc(r1), flipInc(r2)), tag: "misreads_inequality_boundary" },
    { text: raysGraphText(flipDir(r1), flipDir(r2)), tag: "misreads_inequality_direction" },
    { text: compoundGraphText(lo, hi, "between", r1.inc, r2.inc), tag: kind === "none" ? "assumes_and_is_between" : "confuses_and_with_or" },
  ];
  const ray = (r: typeof r1) => `${r.inc ? "a closed" : "an open"} circle at ${r.value} pointing ${r.dir}`;
  return {
    stepId: "graph_both_rays",
    rowUpdates: [],
    prompt: `Graph both answers on one number line. Which one shows ${statement}?`,
    choices: withCorrect(raysGraphText(r1, r2), dedup(raysGraphText(r1, r2), wrong, 3)),
    explanationOnCorrect:
      `One ray is ${ray(r1)}, the other is ${ray(r2)}. ` +
      (kind === "none" ? "They point away from each other and never overlap." : "Together they cover the whole number line."),
  };
}

function emptyOrAllStep(kind: "none" | "all", statement: string, lo: number, hi: number): SolverStep {
  const none = kind === "none";
  return {
    stepId: none ? "no_solution" : "all_real_numbers",
    rowUpdates: [{ slotId: "compound_answer", row: { cells: [], caption: none ? "No solution" : "All real numbers", highlight: "success" } }],
    prompt: none ? `Which numbers make both of these true: ${statement}?` : `Which numbers make at least one of these true: ${statement}?`,
    choices: shuffle<Choice>([
      { text: none ? "None - no number does both, so there's no solution" : "Every number - all real numbers", isCorrect: true, misconceptionTag: null },
      { text: `The numbers between ${lo} and ${hi}`, isCorrect: false, misconceptionTag: none ? "assumes_and_is_between" : "confuses_and_with_or" },
      { text: none ? "All real numbers" : "None - no solution", isCorrect: false, misconceptionTag: "confuses_and_with_or" },
    ]),
    explanationOnCorrect: none
      ? `With "and", a number has to make both true - it would have to be on both rays. The rays never overlap, so there's no solution.`
      : `With "or", a number only has to make one of them true - it just has to be on one of the rays. Every number is on at least one, so the answer is all real numbers.`,
  };
}

function graphStep(ans: CompoundAnswer, statement: string, extra: string): SolverStep {
  const other = ans.shape === "between" ? "outside" : "between";
  const { lo, hi, loInc, hiInc } = ans;
  const circle = (inc: boolean) => (inc ? "closed" : "open");
  const lead = (inc: boolean) => (inc ? "A closed" : "An open");
  const where =
    ans.shape === "between"
      ? "shaded between them"
      : `shaded to the left of ${lo} and to the right of ${hi}`;
  const circles =
    loInc === hiInc
      ? `${lead(loInc)} circle at ${lo} and at ${hi}`
      : `${lead(loInc)} circle at ${lo} and ${circle(hiInc) === "open" ? "an open" : "a closed"} circle at ${hi}`;
  return {
    stepId: "graph_solution",
    rowUpdates: [],
    prompt: `Which number line shows ${statement}?`,
    choices: shuffle<Choice>([
      { text: compoundGraphText(lo, hi, ans.shape, loInc, hiInc), isCorrect: true, misconceptionTag: null },
      { text: compoundGraphText(lo, hi, ans.shape, !loInc, !hiInc), isCorrect: false, misconceptionTag: "misreads_inequality_boundary" },
      { text: compoundGraphText(lo, hi, other, loInc, hiInc), isCorrect: false, misconceptionTag: "confuses_and_with_or" },
      { text: compoundGraphText(lo, hi, other, !loInc, !hiInc), isCorrect: false, misconceptionTag: "misreads_inequality_graph" },
    ]),
    explanationOnCorrect: `${circles}, ${where}, matches ${statement}.${extra}`,
  };
}

const ps = (s: ComparisonSymbol) => ((s as string) === "=" ? "=" : plainSymbol(s));

// ======================================================================
// One line:  left  s1  a x + b  s2  right
//
// Split into two inequalities, "left s1 ax + b"  and  "ax + b s2 right",
// solved side by side like any other pair. At the end the first one has
// the variable on the right ("-2 < x"), so it's swapped to "x > -2".
// ======================================================================
function buildSandwich(p: Extract<CompoundInequality, { kind: "sandwich" }>, x: string): SolverInstance {
  const { left, s1, a, b, s2, right } = p;
  const ax = renderMultiplyTerm(a, x);
  const bF = b === 0 ? BLANK : renderConstant(b, true);
  // the same 9 columns as the split line, so it lines up with it
  // The problem as given sits with its second sign where the "and" will
  // be, so the left part lines up with the split line under it. (SPILL: the
  // sign and the number after it are drawn from the start of the "and"
  // column, at normal spacing, without widening it.)
  const initial = [pc(left), REL(s1), ax, bF, `SPILL:${s2}\u0005${right}`, BLANK, BLANK, BLANK, BLANK];
  const split = [pc(left), REL(s1), ax, bF, JOIN("and"), ax, bF, REL(s2), pc(right)];
  const expr = `${plainTerm(a, x)}${b === 0 ? "" : ` ${b > 0 ? "+" : "-"} ${Math.abs(b)}`}`;
  const whole = `${left} ${ps(s1)} ${expr} ${ps(s2)} ${right}`;
  const answer = `${left} ${ps(s1)} ${expr} and ${expr} ${ps(s2)} ${right}`;
  const splitStep: SolverStep = {
    stepId: "split_inequality",
    rowUpdates: [{ slotId: "split", row: { cells: split } }],
    prompt: `Let's split ${whole} into two inequalities and solve each one. Which two inequalities is it made of?`,
    choices: withCorrect(answer, dedup(answer, [
      { text: `${left} ${ps(s1)} ${expr} or ${expr} ${ps(s2)} ${right}`, tag: "confuses_and_with_or" },
      { text: `${left} ${ps(s1)} ${expr} and ${expr} ${ps(flipSymbol(s2))} ${right}`, tag: "misreads_inequality_direction" },
      { text: `${left} ${ps(flipSymbol(s1))} ${expr} and ${expr} ${ps(s2)} ${right}`, tag: "misreads_inequality_direction" },
    ], 3)),
    explanationOnCorrect: `${whole} means both are true at the same time, so the two inequalities are joined by "and".`,
  };
  return buildTwoPart(
    { kind: "twoPart", join: "and", p1: { a, b, sym: s1, rhs: left }, p2: { a, b, sym: s2, rhs: right } },
    x,
    { firstVarRight: true, lead: { initialRow: { cells: initial }, steps: [splitStep], startSlot: "split" } }
  );
}

// ======================================================================
// Two inequalities:  a1 x + b1  s1  r1   or/and   a2 x + b2  s2  r2
// ======================================================================
export const COLS_TWO_PART = [
  { v: 0, c: 1, s: 2, r: 3 },
  { v: 5, c: 6, s: 7, r: 8 },
];
const ORDINAL = ["first", "second"];

export interface TwoPartOptions {
  // Equations instead of inequalities (absolute value): no sign-flip checks
  // and no graph - the two answers are the last line.
  equation?: boolean;
  // The first inequality is written "number  sign  ax + b" (a one-line
  // problem split in two): the variable is on the right, and is moved to
  // the left at the very end.
  firstVarRight?: boolean;
  // Steps and a first line that come before the two inequalities appear
  // (the one-line problem and the "split it" step); `startSlot` is the
  // line holding the two inequalities.
  lead?: { initialRow: GridRow; steps: SolverStep[]; startSlot: string };
}

export function buildTwoPart(p: Extract<CompoundInequality, { kind: "twoPart" }>, x: string, opts: TwoPartOptions = {}): SolverInstance {
  const { join } = p;
  const parts = [p.p1, p.p2];
  const varRight = !!opts.firstVarRight;
  const COLS = varRight ? [{ v: 2, c: 3, s: 1, r: 0 }, COLS_TWO_PART[1]] : COLS_TWO_PART;
  // "and"/"or" is the anchor column: it stays in exactly the same place on
  // every line, the way "=" does in an equation.
  const e = 4;
  const startSlot = opts.lead?.startSlot ?? "__initial__";
  const eqMode = !!opts.equation;
  const noun = eqMode ? "equation" : "inequality";
  let carryNote = ""; // equations: a note that would have gone with a sign-flip check
  const symCell = (_i: number, s: ComparisonSymbol) => REL(s);
  // a line of work: blank, with the "and"/"or" in place
  const blankRow = () => {
    const c = [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK];
    c[e] = JOIN(join);
    return c;
  };
  // a line of "-1  -1" notes under the line above (no "and"/"or")
  const annRow = () => {
    const c = blankRow();
    c[e] = "";
    return c;
  };
  // "and"/"or" is written once, on the top line (the problem, or the line
  // that splits it in two) - the work lines under it don't repeat it. Note
  // lines never show it either.
  const row = (c: string[], highlight?: GridRow["highlight"]): GridRow => {
    const cells = [...c];
    if (cells[e] !== "" && c !== initial) {
      cells[e] = BLANK;
      return { cells, spanNext: [COLS[0].v, COLS[1].v], ...(highlight ? { highlight } : {}) };
    }
    return { cells, ...(highlight ? { highlight } : {}) };
  };
  const exprText = (q: InequalityPart) => `${plainTerm(q.a, x)}${q.b === 0 ? "" : ` ${q.b > 0 ? "+" : "-"} ${Math.abs(q.b)}`}`;
  const partText = (q: InequalityPart) => {
    const i = parts.indexOf(q);
    return varRight && i === 0 ? `${q.rhs} ${ps(q.sym)} ${exprText(q)}` : `${exprText(q)} ${ps(q.sym)} ${q.rhs}`;
  };

  const initial = blankRow();
  parts.forEach((q, i) => {
    const k = COLS[i];
    initial[k.v] = renderMultiplyTerm(q.a, x);
    initial[k.c] = q.b === 0 ? BLANK : renderConstant(q.b, true);
    initial[k.s] = symCell(i, q.sym);
    initial[k.r] = pc(q.rhs);
  });
  initial[4] = JOIN(join);

  const steps: SolverStep[] = [];
  const anyConst = parts.some((q) => q.b !== 0);
  const anyDivide = parts.some((q) => q.a !== 1);
  // An inequality is worked on the line where it already is: one with
  // nothing to add or subtract is divided right on the problem's line (it's
  // never brought down first just to be worked on). Both answers end up
  // side by side on the last line.
  const needIso = parts.some((q) => q.b !== 0 && q.a !== 1);
  const finalSlot = needIso ? "isolated" : anyConst ? "simplified" : anyDivide ? "isolated" : startSlot;

  // ---------- One inequality at a time: the first all the way, then the second ----------
  const initialNow = [...initial];
  const ann = annRow();
  const simp = blankRow();
  const iso = blankRow();
  const lineOf = (slot: string): string[] =>
    slot === "cancel_annotation" ? ann : slot === "simplified" ? simp : slot === "isolated" ? iso : initialNow;
  // the problem's own line keeps its "and"/"or" and its spacing
  const rowFor = (slot: string, highlight?: GridRow["highlight"]): GridRow =>
    slot === startSlot ? { cells: [...initialNow], ...(highlight ? { highlight } : {}) } : row(lineOf(slot), highlight);
  const after = parts.map((q) => q.rhs - q.b);
  const finals: { sym: ComparisonSymbol; value: number }[] = parts.map((q) => ({ sym: q.sym, value: q.rhs - q.b }));
  const hasWork = parts.map((q) => q.b !== 0 || q.a !== 1);
  const done = [false, false];
  // On the lines after the problem, the variable term sits right next to
  // its inequality sign (in the column the constant used to fill), so
  // "2x < 4" isn't spread out.
  const tcol = (i: number) => COLS[i].v; // spans the constant's (now empty) column too
  const put = (cells: string[], i: number, v: string, sym: ComparisonSymbol, r: string) => {
    const k = COLS[i];
    cells[tcol(i)] = v;
    cells[k.s] = symCell(i, sym);
    cells[k.r] = r;
  };
  // Like on paper: each answer is written right under its own work. Once
  // both are solved, the one that finished higher up is relisted (with an
  // arrow) next to the other, on the last line.
  const startFinal = (_i: number, _slot: string): string => "";
  const answers: { i: number; slot: string; from: number }[] = [];
  const workers = parts.map((_q, i) => i).filter((i) => hasWork[i]);

  parts.forEach((q, i) => {
    if (!hasWork[i]) {
      done[i] = true;
      return;
    }
    const k = COLS[i];
    let leadUsed = false;
    const lead = () => {
      if (leadUsed) return "";
      leadUsed = true;
      if (workers.length === 1) return `Let's solve ${partText(q)}. `;
      return i === workers[0] ? `Start with the ${ORDINAL[i]} ${noun}, ${partText(q)}. ` : `Now the ${ORDINAL[i]} ${noun}, ${partText(q)}. `;
    };
    const id = (base: string) => (i === workers[0] ? base : `${base}_2`);

    // --- the constant ---
    if (q.b !== 0) {
      const c = renderConstant(-q.b, true, false);
      ann[k.c] = c;
      ann[k.r] = c;
      steps.push({
        stepId: id("goal_eliminate_constant"),
        rowUpdates: [{ slotId: "cancel_annotation", row: row(ann) }],
        prompt: `${lead()}What undoes the ${signedConst(q.b)}?`,
        choices: goalChoices(q.b, "both sides", `the side with ${x} only`),
        explanationOnCorrect: q.b >= 0 ? `Undo addition by subtracting ${q.b} from both sides.` : `Undo subtraction by adding ${-q.b} to both sides.`,
      });
      const note = startFinal(i, "simplified");
      simp[k.s] = symCell(i, q.sym);
      if (eqMode) carryNote = note;
      else
        steps.push(
          flipCheck(id("sign_flip_check_constant"), "simplified", row(simp), false, "", false, `Adding or subtracting the same value from both sides never flips an inequality.${note}`)
        );
      initialNow[k.c] = `MARKEDTERM:${initial[k.c]}`;
      const annMarked = [...ann];
      annMarked[k.c] = `MARKEDTERM:${c}`;
      const cs = cancelStep(q.b, [
        { slotId: startSlot, row: rowFor(startSlot) },
        { slotId: "cancel_annotation", row: row(annMarked) },
      ]);
      cs.stepId = id("cancel_constant");
      cs.explanationOnCorrect += carryNote;
      carryNote = "";
      steps.push(cs);
      ann[k.c] = `MARKEDTERM:${c}`;
      const cp = combinePrompt(q.rhs, q.b);
      simp[tcol(i)] = renderMultiplyTerm(q.a, x);
      simp[k.r] = pc(after[i]);
      const updates: SolverStep["rowUpdates"] = [{ slotId: "simplified", row: row(simp) }];
      steps.push({
        stepId: id("combine_constant"),
        rowUpdates: updates,
        prompt: cp.prompt,
        choices: cp.choices,
        explanationOnCorrect: `The terms combine to ${after[i]}. The rest of the ${noun} gets brought down unchanged.`,
      });
      if (q.a === 1) answers.push({ i, slot: "simplified", from: steps.length - 1 });
    }

    // --- the coefficient ---
    if (q.a !== 1) {
      const willFlip = q.a < 0 && !eqMode;
      const fs = willFlip ? flipSymbol(q.sym) : q.sym;
      const value = after[i] / q.a;
      // divided in place: on the constants line, or on the problem's own line
      const divSlot = q.b !== 0 ? "simplified" : startSlot;
      // (with notes on the line below the problem, the answer goes on that
      // notes line - like on paper, right under the fractions, level with the
      // other inequality's "+4  +4")
      const resSlot = q.b !== 0 ? "isolated" : anyConst ? "cancel_annotation" : "isolated";
      const div = lineOf(divSlot);
      const res = lineOf(resSlot);
      div[k.s] = symCell(i, q.sym);
      div[divSlot === startSlot ? k.v : tcol(i)] = `\\dfrac{${divNumerator(q.a, x)}}{${q.a}}`;
      div[k.r] = `\\dfrac{${after[i]}}{${q.a}}`;
      steps.push({
        stepId: id("eliminate_coefficient"),
        rowUpdates: [{ slotId: divSlot, row: rowFor(divSlot) }],
        prompt: `${lead()}What undoes multiplying ${x} by ${q.a}?`,
        choices: divideChoices(q.a, "both sides", q.b),
        explanationOnCorrect: `The coefficient ${q.a} cancels when we divide both sides by ${q.a}.`,
      });
      const note = startFinal(i, resSlot);
      res[k.s] = symCell(i, fs);
      if (eqMode) carryNote = note;
      else steps.push(
        flipCheck(
          id("sign_flip_check_coefficient"),
          resSlot,
          rowFor(resSlot),
          willFlip,
          `dividing both sides by ${q.a}`,
          false,
          (willFlip
            ? `Multiplying or dividing both sides by a negative number (${q.a}) flips the inequality sign.`
            : `${q.a} is positive, so dividing both sides by it does not flip the inequality sign.`) + note
        )
      );
      div[divSlot === startSlot ? k.v : tcol(i)] = `MARKEDFRACTION:${q.a}\u0006${x}\u0005${q.a}`;
      res[tcol(i)] = x;
      const co = coefficientOneStep(q.a, [
        { slotId: divSlot, row: rowFor(divSlot) },
        { slotId: resSlot, row: rowFor(resSlot) },
      ]);
      co.stepId = id("confirm_coefficient_one");
      co.explanationOnCorrect += carryNote;
      carryNote = "";
      steps.push(co);
      res[k.r] = pc(value);
      steps.push(
        computeStep(id("compute_value"), after[i], q.a, [{ slotId: resSlot, row: rowFor(resSlot) }], "", eqMode ? `What is the value of ${x}?` : undefined)
      );
      answers.push({ i, slot: resSlot, from: steps.length - 1 });
      finals[i] = { sym: fs, value };
    }
    done[i] = true;
  });

  // ---------- Each answer: green, in a box, right where it was found ----------
  // (The first inequality of a one-line problem is boxed once it's turned
  // around to "x > -2", below.)
  const mark = (r: GridRow, i: number): GridRow => {
    const k = COLS[i];
    const group = [k.v, k.c, k.s, k.r];
    return { ...r, successCols: [...(r.successCols ?? []), ...group], boxCols: [...(r.boxCols ?? []), group] };
  };
  for (const a of answers) {
    if (varRight && a.i === 0) continue;
    for (let si = a.from; si < steps.length; si++) {
      for (const u of steps[si].rowUpdates) if (u.slotId === a.slot) u.row = mark(u.row as GridRow, a.i);
    }
  }
  // an inequality with nothing to solve is already its answer
  if (steps.length) {
    parts.forEach((_q, j) => {
      if (hasWork[j] || (varRight && j === 0)) return;
      const last = steps[steps.length - 1];
      last.rowUpdates = [...last.rowUpdates, { slotId: startSlot, row: mark(rowFor(startSlot), j) }];
    });
  }

  // Lines appear in order - notes, the line after the constants, the line
  // with x by itself - even when one inequality reaches a later line first
  // (it's divided right on the problem's line): the earlier lines are put
  // in place, still empty, at that moment.
  const LINE_ORDER = ["cancel_annotation", "simplified", "isolated"];
  const used = new Set(steps.flatMap((st) => st.rowUpdates.map((u) => u.slotId)));
  const empty = (slot: string): GridRow => (slot === "cancel_annotation" ? row(annRow()) : row(blankRow()));
  const seen = new Set<string>();
  for (const st of steps) {
    const ups: SolverStep["rowUpdates"] = [];
    for (const u of st.rowUpdates) {
      const at = LINE_ORDER.indexOf(u.slotId);
      if (at > 0 && !seen.has(u.slotId)) {
        for (const earlier of LINE_ORDER.slice(0, at)) {
          if (used.has(earlier) && !seen.has(earlier)) {
            ups.push({ slotId: earlier, row: empty(earlier) });
            seen.add(earlier);
          }
        }
      }
      seen.add(u.slotId);
      ups.push(u);
    }
    st.rowUpdates = ups;
  }

  // When one inequality is divided right on the problem's line, its answer
  // goes on the notes line, under its fractions. The notes line still tucks
  // up under the problem (so the other inequality's "+4  +4" sit right under
  // their numbers) - just enough for that answer to clear the fractions.
  if (parts.some((q) => q.b === 0 && q.a !== 1) && anyConst) {
    for (const st of steps) for (const u of st.rowUpdates) if (u.slotId === "cancel_annotation") u.row = { ...(u.row as GridRow), tuckPastFractions: true };
  }

  // The answer line: highlighted on the last step that writes it (the
  // swap step below has its own line, when there is one).
  if (!varRight) {
    for (let s = steps.length - 1; s >= 0; s--) {
      const u = steps[s].rowUpdates.find((r) => r.slotId === finalSlot);
      if (u) {
        u.row = { ...(u.row as GridRow), highlight: "success" };
        break;
      }
    }
  }

  // ---------- The first inequality: variable to the left ----------
  if (varRight) {
    const f = finals[0];
    const canonical = flipSymbol(f.sym);
    const k = COLS[0];
    const c = blankRow(); // just the turned-around answer (the other one is boxed where it is)
    c[k.r] = x;
    c[k.s] = REL(canonical);
    c[k.v] = pc(f.value);
    c[k.c] = BLANK;
    steps.push({
      stepId: "canonicalize_orientation",
      rowUpdates: [{ slotId: "canonicalized", row: { ...row(c, "success"), boxCols: [[0, 1, 2, 3]] } }],
      prompt: `${f.value} ${ps(f.sym)} ${x} has the variable on the right. The goal is to get the variable on the left. Do we flip the sign when we swap sides?`,
      choices: shuffle<Choice>([
        { text: "Yes - the symbol flips when you swap sides", isCorrect: true, misconceptionTag: null },
        { text: "No - the symbol stays the same", isCorrect: false, misconceptionTag: "forgot_symbol_flips_on_side_swap" },
      ]),
      explanationOnCorrect: `We flip the inequality sign when we swap the sides: ${f.value} ${ps(f.sym)} ${x} is the same as ${x} ${ps(canonical)} ${f.value}.`,
    });
    finals[0] = { sym: canonical, value: f.value };
  }

  // ---------- Graph ----------
  if (eqMode) {
    return {
      initialRow: opts.lead ? opts.lead.initialRow : row(initial),
      steps: [...(opts.lead?.steps ?? []), ...steps],
      eqColumnIndex: e,
      columnCount: 9,
      termAlign: "right",
      alignColumns: true,
    };
  }
  const rays = finals.map((f) => ({ value: f.value, dir: symbolDirection(f.sym), inc: isInclusive(f.sym) }));
  const ans = combineRays(rays[0], rays[1], join);
  const statement = `${x} ${ps(finals[0].sym)} ${finals[0].value} ${join} ${x} ${ps(finals[1].sym)} ${finals[1].value}`;
  const special = ans ? null : emptyOrAll(rays[0], rays[1], join);
  if (!ans && !special) throw new Error("compound inequality: unsupported answer shape");
  if (special) {
    const vs = finals.map((f) => f.value).sort((m, n) => m - n);
    steps.push(raysGraphStep(special, rays, statement));
    steps.push(emptyOrAllStep(special, statement, vs[0], vs[1]));
    return {
      initialRow: opts.lead ? opts.lead.initialRow : row(initial),
      steps: [...(opts.lead?.steps ?? []), ...steps],
      eqColumnIndex: e,
      columnCount: 9,
      termAlign: "right",
      alignColumns: true,
    };
  }
  let extra = "";
  if (!ans) throw new Error("unreachable");
  if (join === "and") {
    const lowSym = ans.loInc ? "≤" : "<";
    const highSym = ans.hiInc ? "≤" : "<";
    extra = ` With "and", a number has to make both true, so only the numbers between ${ans.lo} and ${ans.hi} work. (This is the same as ${ans.lo} ${lowSym} ${x} ${highSym} ${ans.hi}.)`;
  } else {
    extra = ` With "or", a number only has to make one of the two true, so the graph goes out in both directions.`;
  }
  steps.push(graphStep(ans, statement, extra));

  if (opts.lead) {
    return {
      initialRow: opts.lead.initialRow,
      steps: [...opts.lead.steps, ...steps],
      eqColumnIndex: e,
      columnCount: 9,
      termAlign: "right",
      alignColumns: true,
    };
  }
  return { initialRow: row(initial), steps, eqColumnIndex: e, columnCount: 9, termAlign: "right", alignColumns: true };
}

export function buildCompoundInequalityInstance(p: CompoundInequality, x: string = "x"): SolverInstance {
  return p.kind === "sandwich" ? buildSandwich(p, x) : buildTwoPart(p, x);
}

// ---------- the answer each problem should reach (used by tests/router) ----------
export function solveCompound(p: CompoundInequality): CompoundAnswer | null {
  if (p.kind === "sandwich") {
    if (p.a === 0) return null;
    if (symbolDirection(p.s1) !== symbolDirection(p.s2)) return null;
    let vL = (p.left - p.b) / p.a;
    let vR = (p.right - p.b) / p.a;
    let fl = p.a < 0 ? flipSymbol(p.s1) : p.s1;
    let fr = p.a < 0 ? flipSymbol(p.s2) : p.s2;
    if (symbolDirection(fl) === "right") {
      [vL, vR] = [vR, vL];
      [fl, fr] = [flipSymbol(fr), flipSymbol(fl)];
    }
    if (!(vL < vR)) return null;
    return { shape: "between", lo: vL, hi: vR, loInc: isInclusive(fl), hiInc: isInclusive(fr) };
  }
  const rays = [p.p1, p.p2].map((q) => {
    const s = q.a < 0 ? flipSymbol(q.sym) : q.sym;
    return { value: (q.rhs - q.b) / q.a, dir: symbolDirection(s), inc: isInclusive(s) };
  });
  return combineRays(rays[0], rays[1], p.join);
}

export function twoPartSpecial(p: CompoundInequality): "none" | "all" | null {
  if (p.kind !== "twoPart") return null;
  const rays = [p.p1, p.p2].map((q) => {
    const s = q.a < 0 ? flipSymbol(q.sym) : q.sym;
    return { value: (q.rhs - q.b) / q.a, dir: symbolDirection(s), inc: isInclusive(s) };
  });
  return emptyOrAll(rays[0], rays[1], p.join);
}

// ---------- random problems ----------
function nonZero(min: number, max: number): number {
  let v = randInt(min, max);
  while (v === 0) v = randInt(min, max);
  return v;
}

const LESS: ComparisonSymbol[] = ["<", "\\leq"];
const MORE: ComparisonSymbol[] = [">", "\\geq"];

function partFor(value: number, finalSym: ComparisonSymbol, allowOneStep: boolean): InequalityPart {
  for (;;) {
    const a = randInt(1, 5) * (Math.random() < 0.35 ? -1 : 1);
    const b = allowOneStep && Math.random() < 0.2 ? 0 : nonZero(-9, 9);
    if (a === 1 && b === 0) continue;
    if (a === -1) continue;
    const sym = a < 0 ? flipSymbol(finalSym) : finalSym;
    return { a, b, sym, rhs: a * value + b };
  }
}

export function generateCompoundInequality(): CompoundInequality {
  const r = Math.random();
  if (r < 0.55) {
    for (;;) {
      const a = Math.random() < 0.1 ? 1 : randInt(2, 5) * (Math.random() < 0.35 ? -1 : 1);
      const b = a === 1 ? nonZero(-9, 9) : Math.random() < 0.15 ? 0 : nonZero(-9, 9);
      const lo = randInt(-8, 5);
      const hi = lo + randInt(2, 7);
      const s1 = LESS[randInt(0, 1)];
      const s2 = LESS[randInt(0, 1)];
      // a > 0: left = a*lo + b;  a < 0: the bigger value of x gives the smaller number
      const left = a > 0 ? a * lo + b : a * hi + b;
      const right = a > 0 ? a * hi + b : a * lo + b;
      if (left === 0 && right === 0) continue;
      return { kind: "sandwich", left, s1, a, b, s2, right };
    }
  }
  const join: "and" | "or" = r < 0.88 ? "or" : "and";
  const lo = randInt(-8, 5);
  const hi = lo + randInt(1, 7);
  let p1: InequalityPart;
  let p2: InequalityPart;
  if (join === "or") {
    p1 = partFor(lo, LESS[randInt(0, 1)], true);
    p2 = partFor(hi, MORE[randInt(0, 1)], true);
  } else {
    p1 = partFor(lo, MORE[randInt(0, 1)], true);
    p2 = partFor(hi, LESS[randInt(0, 1)], true);
  }
  if (p1.b === 0 && p2.b === 0) p2 = partFor(join === "or" ? hi : hi, p2.a < 0 ? flipSymbol(p2.sym) : p2.sym, false);
  if (randBool() && Math.random() < 0.5) [p1, p2] = [p2, p1];
  return { kind: "twoPart", join, p1, p2 };
}

export function generateCompoundInequalityInstance(): SolverInstance {
  return buildCompoundInequalityInstance(generateCompoundInequality());
}
