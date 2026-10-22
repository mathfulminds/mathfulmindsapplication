// Quadratics by factoring, leading coefficient 1:  x² + 4x - 12 = 0.
//
//   1. What are the factor pairs of 12? (They're listed beside the work.)
//   2. Of these factor pairs, which one adds to give 4? -> 2 and 6, and the
//      blanks (x   )(x   ) = 0 appear.
//   3. Which signs make it work? The numbers multiply to -12 and add to 4:
//      (x + 6)(x - 2) = 0.
//   4. If two things multiply to 0, one of them is 0: x + 6 = 0 or x - 2 = 0,
//      each solved like any other equation, side by side with "or" staying
//      in place (the same layout as Absolute Value Equations).

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randInt, renderConstant, shuffle } from "./isolateVariableCore";
import type { ComparisonSymbol } from "./inequalityCore";
import { REL, JOIN, buildTwoPart, withCorrect, dedup } from "./compoundInequalities";

export interface FactorProblem {
  b: number; // x² + b x + c = 0
  c: number;
}

const EQ = "=" as unknown as ComparisonSymbol;
const $ = (t: string) => `$${t}$`;
const paren = (n: number) => (n < 0 ? `(${n})` : `${n}`);
const signed = (n: number) => `${n < 0 ? "-" : "+"} ${Math.abs(n)}`;
const factorTex = (p: number, x: string) => `(${x} ${signed(p)})`;
const factorText = (p: number, x: string) => `${x} ${signed(p)}`;

export function quadraticTex(b: number, c: number, x: string = "x"): string {
  const bx = b === 0 ? "" : ` ${b < 0 ? "-" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}${x}`;
  return `${x}^2${bx} ${signed(c)}`;
}

// The two numbers p, q with p + q = b and p·q = c (whole numbers), or null.
export function factorNumbers(b: number, c: number): [number, number] | null {
  const n = Math.abs(c);
  for (let d = 1; d * d <= n; d++) {
    if (n % d) continue;
    const e = n / d;
    for (const [p, q] of [[d, e], [-d, -e], [d, -e], [-d, e]] as [number, number][]) {
      if (p + q === b && p * q === c) {
        // the order they're written in: the bigger one first when the signs
        // differ, the smaller one first when they're the same
        return c < 0 ? (Math.abs(p) >= Math.abs(q) ? [p, q] : [q, p]) : Math.abs(p) <= Math.abs(q) ? [p, q] : [q, p];
      }
    }
  }
  return null;
}

export function factorPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 1; d * d <= n; d++) if (n % d === 0) out.push([d, n / d]);
  return out;
}

export function buildFactorInstance(prob: FactorProblem, x: string = "x"): SolverInstance {
  const { b, c } = prob;
  const fn = factorNumbers(b, c);
  if (!fn) throw new Error("quadratic doesn't factor over the integers");
  const [p, q] = fn;
  const n = Math.abs(c);
  const pairs = factorPairs(n);
  const pairText = ([d, e]: [number, number]) => `${d} and ${e}`;
  const chosen = pairs.findIndex(([d, e]) => (d === Math.abs(p) && e === Math.abs(q)) || (d === Math.abs(q) && e === Math.abs(p)));
  const e = 4;

  const line = (term: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: [term, BLANK, REL(EQ), "0", BLANK, BLANK, BLANK, BLANK, BLANK],
    spanNext: [0],
    noWidthCols: [0, 3],
    ...(highlight ? { highlight } : {}),
  });
  const initialRow = line(quadraticTex(b, c, x));
  const steps: SolverStep[] = [];

  // ---------- 1. the factor pairs of c ----------
  const list = { title: `Factor pairs of ${n}`, items: pairs.map(([d, e2]) => `${d} \\cdot ${e2}`) };
  const all = pairs.map(pairText).join(", ");
  const sumPairs = [1, 2, 3].filter((d) => d < n - d).map((d) => `${d} and ${n - d}`).join(", ");
  steps.push({
    stepId: "factor_pairs",
    rowUpdates: [],
    prompt: `What are the factor pairs of ${n}?`,
    choices: withCorrect(all, dedup(all, [
      ...(pairs.length > 1 ? [{ text: pairs.slice(0, -1).map(pairText).join(", "), tag: "missed_a_factor_pair" }] : []),
      ...(sumPairs ? [{ text: sumPairs, tag: "adds_instead_of_multiplies" }] : []),
      { text: `${all}, ${pairs[pairs.length - 1][0] + 1} and ${pairs[pairs.length - 1][1] + 1}`, tag: "includes_a_non_factor" },
    ], 2)),
    explanationOnCorrect: `${pairs.map(([d, e2]) => `${d} × ${e2}`).join(", ")} ${pairs.length > 1 ? "all make" : "makes"} ${n}. They're listed beside the problem.`,
    sideList: list,
  });

  // ---------- 2. the pair that adds to b ----------
  const blanks = `(${x}\\phantom{{}${signed(p)}})(${x}\\phantom{{}${signed(q)}})`;
  // every pair (at most 4 choices: the right one and the pairs next to it)
  const near = pairs.map((pr, i) => ({ pr, i })).sort((u, v) => Math.abs(u.i - chosen) - Math.abs(v.i - chosen)).slice(0, 4);
  const pairChoices: Choice[] = near.map(({ pr, i }) => ({ text: pairText(pr), isCorrect: i === chosen, misconceptionTag: i === chosen ? null : "wrong_factor_pair" }));
  if (pairChoices.length < 2) pairChoices.push({ text: "None of them", isCorrect: false, misconceptionTag: "wrong_factor_pair" });
  const [small, big] = [Math.min(Math.abs(p), Math.abs(q)), Math.max(Math.abs(p), Math.abs(q))];
  steps.push({
    stepId: "factor_pick_pair",
    rowUpdates: [{ slotId: "factored", row: line(blanks) }],
    prompt: `Of these factor pairs, which one adds to give ${b}? (Each number can be positive or negative.)`,
    choices: shuffle(pairChoices),
    explanationOnCorrect:
      c < 0
        ? `${small} and ${big} are ${big - small} apart, so with one of them negative they can add to ${b}. The two blanks are for these numbers - next, their signs.`
        : `${small} + ${big} = ${small + big}, so with the same sign on both they can add to ${b}. The two blanks are for these numbers - next, their signs.`,
    sideList: { ...list, marked: chosen },
  });

  // ---------- 3. the signs ----------
  const factored = `${factorTex(p, x)}${factorTex(q, x)}`;
  const variants: [number, number][] = [
    [p, q],
    [-p, -q],
    [Math.abs(p), Math.abs(q)],
    [-Math.abs(p), -Math.abs(q)],
    [Math.abs(p), -Math.abs(q)],
    [-Math.abs(p), Math.abs(q)],
  ];
  const seen = new Set<string>();
  const signChoices: Choice[] = [];
  for (const [u, v] of variants) {
    const key = [u, v].sort((m, k) => m - k).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    signChoices.push({ text: $(`${factorTex(u, x)}${factorTex(v, x)}`), isCorrect: u === p && v === q, misconceptionTag: u === p && v === q ? null : "wrong_signs" });
  }
  steps.push({
    stepId: "factor_signs",
    rowUpdates: [{ slotId: "factored", row: line(factored) }],
    prompt: `The two numbers have to multiply to ${c} and add to ${b}. Which signs make that work?`,
    choices: shuffle(signChoices.slice(0, 4)),
    explanationOnCorrect: `${paren(p)} × ${paren(q)} = ${c} and ${paren(p)} + ${paren(q)} = ${b}, so it factors as ${$(factored)}.`,
  });

  // ---------- 4. zero product: split into two equations ----------
  // (constants in their own columns, like every two-part line)
  const split: GridRow = { cells: [x, renderConstant(p, true), REL(EQ), "0", JOIN("or"), x, renderConstant(q, true), REL(EQ), "0"] };
  const ans = `${factorText(p, x)} = 0 or ${factorText(q, x)} = 0`;
  steps.push({
    stepId: "factor_zero_product",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `If two things multiply to 0, one of them has to be 0. Which two equations does ${$(`${factored} = 0`)} make?`,
    choices: withCorrect(ans, dedup(ans, [
      { text: `${x} = ${p} or ${x} = ${q}`, tag: "takes_numbers_as_answers" },
      { text: `${factorText(p, x)} = 0 only`, tag: "forgot_second_factor" },
      { text: `${factorText(p, x)} = ${c} or ${factorText(q, x)} = ${c}`, tag: "sets_factors_to_c" },
    ], 2)),
    explanationOnCorrect: `The only way a product is 0 is if one of the factors is 0. So ${factorText(p, x)} = 0 or ${factorText(q, x)} = 0.`,
  });

  // ---------- 5. solve both ----------
  return buildTwoPart(
    { kind: "twoPart", join: "or", p1: { a: 1, b: p, sym: EQ, rhs: 0 }, p2: { a: 1, b: q, sym: EQ, rhs: 0 } },
    x,
    { equation: true, lead: { initialRow, steps, startSlot: "split" } }
  );
}

// ---------- practice problems ----------
export function generateFactorProblem(): FactorProblem {
  for (;;) {
    const r1 = randInt(-9, 9);
    const r2 = randInt(-9, 9);
    // (no x term, like x² - 9 = 0, is Square & Cube Roots)
    if (r1 === 0 || r2 === 0 || r1 === r2 || r1 === -r2) continue;
    const b = -(r1 + r2);
    const c = r1 * r2;
    if (Math.abs(c) > 60) continue;
    return { b, c };
  }
}

export function generateFactorInstance(): SolverInstance {
  return buildFactorInstance(generateFactorProblem());
}
