// Quadratics by factoring with a number in front of x² - the slip and slide
// method:  2x² + 7x + 3 = 0.
//
//   1. Slip: multiply a into c and drop the a: x² + 7x + 6 = 0.
//   2. Factor that like Quadratics by Factoring (x² + bx + c): the factor
//      pairs of 6 beside the work, the pair that adds to 7, the signs:
//      (x + 1)(x + 6) = 0.
//   3. Slide back: divide both numbers by a: (x + 1/2)(x + 6/2) = 0.
//   4. Reduce: (x + 1/2)(x + 3) = 0 (skipped when nothing reduces).
//   5. Bottoms slide: a fraction that's left moves its denominator in front of
//      the x: (2x + 1)(x + 3) = 0.
//   6. Zero product: 2x + 1 = 0 or x + 3 = 0, both solved side by side.
//
// (Leading coefficient 1 never comes here - that's Quadratics by Factoring.)

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randInt, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import type { ComparisonSymbol } from "./inequalityCore";
import { REL, JOIN, buildTwoPart, withCorrect, dedup } from "./compoundInequalities";
import { factorNumbers, factorPairs, zeroLeftText, zeroLeftLine, exprLine, EXPR_LAYOUT, type FactorOptions } from "./quadraticsFactoring";

export interface SlipProblem {
  a: number; // a x² + b x + c = 0, a ≥ 2
  b: number;
  c: number;
}

const EQ = "=" as unknown as ComparisonSymbol;
const $ = (t: string) => `$${t}$`;
const paren = (n: number) => (n < 0 ? `(${n})` : `${n}`);
const signed = (n: number) => `${n < 0 ? "-" : "+"} ${Math.abs(n)}`;
const gcd = (m: number, n: number): number => {
  m = Math.abs(m);
  n = Math.abs(n);
  while (n) [m, n] = [n, m % n];
  return m;
};

export function quadTex(a: number, b: number, c: number, x: string = "x"): string {
  const ax = `${a === 1 ? "" : a}${x}^2`;
  const bx = b === 0 ? "" : ` ${b < 0 ? "-" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}${x}`;
  return `${ax}${bx} ${signed(c)}`;
}
const quadText = (a: number, b: number, c: number, x: string) => quadTex(a, b, c, x).replace("^2", "²");

// (x + p/a) - a fraction stays a fraction; written over a with no reducing
const overA = (p: number, a: number, x: string, hl = false) => `(${x} ${p < 0 ? "-" : "+"} \\dfrac{${Math.abs(p)}}{${hl ? hlNum(a) : a}})`;
// (x + r/s) in lowest terms, or (x + r) when it's whole
function reduced(p: number, a: number): { r: number; s: number } {
  const g = gcd(p, a);
  return { r: p / g, s: a / g };
}
const reducedTex = (p: number, a: number, x: string) => {
  const { r, s } = reduced(p, a);
  return s === 1 ? `(${x} ${signed(r)})` : `(${x} ${r < 0 ? "-" : "+"} \\dfrac{${Math.abs(r)}}{${s}})`;
};
// bottoms up: (s x + r)
const bottomsTex = (p: number, a: number, x: string) => {
  const { r, s } = reduced(p, a);
  return `(${renderMultiplyTerm(s, x)} ${signed(r)})`;
};
const bottomsText = (p: number, a: number, x: string) => {
  const { r, s } = reduced(p, a);
  return `${s === 1 ? "" : s}${x} ${signed(r)}`;
};

// The slip and slide numbers for ax² + bx + c, or null when it doesn't work
// here (doesn't factor, a common factor, both answers the same).
export function slipNumbers(prob: SlipProblem): [number, number] | null {
  const { a, b, c } = prob;
  if (a < 2 || c === 0 || gcd(gcd(a, b), c) !== 1) return null;
  const fn = factorNumbers(b, a * c);
  if (!fn || fn[0] === fn[1]) return null;
  return fn;
}

// The leading coefficient, called out (bold, in blue) from the slide back
// on - written as a plain bold number, so it sits right against its x² and
// stays centered under a fraction bar.
export const hlNum = (n: number) => `\\textcolor{#2e6fa3}{\\mathbf{${n}}}`;

export function buildSlipInstance(
  prob: SlipProblem,
  x: string = "x",
  // steps that get it ready first, and the line where ax² + bx + c ends up
  prelude?: { initialRow: GridRow; steps: SolverStep[]; trinomial?: { slotId: string; row: GridRow }; zeroLeft?: boolean },
  opts?: FactorOptions
): SolverInstance {
  // (factoring only: an expression, with nothing to solve at the end)
  const fo = !!opts?.factorOnly;
  // (a 0 on the left - "0 = 2x² + 7x + 3" - stays on the left on every line)
  const zl = !!prelude?.zeroLeft;
  const eq0 = (t: string) => (fo ? t : zl ? `0 = ${t}` : `${t} = 0`);
  const { a, b, c } = prob;
  const fn = slipNumbers(prob);
  if (!fn) throw new Error("slip and slide doesn't apply");
  const [p, q] = fn;
  const ac = a * c;
  const n = Math.abs(ac);
  const pairs = factorPairs(n);
  const pairText = ([d, e]: [number, number]) => `${d} and ${e}`;
  const chosen = pairs.findIndex(([d, e]) => (d === Math.abs(p) && e === Math.abs(q)) || (d === Math.abs(q) && e === Math.abs(p)));

  const line = (term: string, highlight?: GridRow["highlight"]): GridRow =>
    fo ? exprLine(term, highlight) : zl ? zeroLeftLine("0", term) : { cells: [term, BLANK, REL(EQ), "0", BLANK, BLANK, BLANK, BLANK, BLANK], spanNext: [0], noWidthCols: [0, 3] };
  // the factors' line: the slide back (dividing by a) happens right on it,
  // lined up on the baseline so nothing shifts when the fractions appear
  const factorLine = (term: string): GridRow => ({ ...line(term), baseline: true });
  const initialRow = prelude ? prelude.initialRow : line(quadTex(a, b, c, x));
  // (getting it ready - one side 0, a GCF out - comes first, when needed)
  const steps: SolverStep[] = prelude ? [...prelude.steps] : [];

  // ---------- 1. slip: a times c ----------
  const slid = quadTex(1, b, ac, x);
  steps.push({
    stepId: "slip_multiply",
    rowUpdates: [{ slotId: "slipped", row: line(slid) }],
    prompt: `We're going to use the slip and slide method. What is ${a} × ${paren(c)}?`,
    choices: withCorrect(`${ac}`, dedup(`${ac}`, [
      { text: `${a + c}`, tag: "adds_instead_of_multiplies" },
      { text: `${-ac}`, tag: "sign_error" },
      { text: `${c}`, tag: "forgot_to_multiply" },
    ], 2)),
    explanationOnCorrect: `${a} × ${paren(c)} = ${ac}. The ${a} slips off the x² and slides onto the last number, so it becomes ${$(eq0(slid))}.`,
  });

  // ---------- 2. factor it (the same questions as Quadratics by Factoring) ----------
  const list = { title: `Factor pairs of ${n}`, items: pairs.map(([d, e]) => `${d} \\cdot ${e}`) };
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
    explanationOnCorrect: `${pairs.map(([d, e]) => `${d} × ${e}`).join(", ")} ${pairs.length > 1 ? "all make" : "makes"} ${n}. They're listed beside the problem.`,
    sideList: list,
  });
  const blanks = `(${x}\\phantom{{}${signed(p)}})(${x}\\phantom{{}${signed(q)}})`;
  const near = pairs.map((pr, i) => ({ pr, i })).sort((u, v) => Math.abs(u.i - chosen) - Math.abs(v.i - chosen)).slice(0, 4);
  const pairChoices: Choice[] = near.map(({ pr, i }) => ({ text: pairText(pr), isCorrect: i === chosen, misconceptionTag: i === chosen ? null : "wrong_factor_pair" }));
  if (pairChoices.length < 2) pairChoices.push({ text: "None of them", isCorrect: false, misconceptionTag: "wrong_factor_pair" });
  const [small, big] = [Math.min(Math.abs(p), Math.abs(q)), Math.max(Math.abs(p), Math.abs(q))];
  steps.push({
    stepId: "factor_pick_pair",
    rowUpdates: [{ slotId: "factored", row: factorLine(blanks) }],
    prompt: `Of these factor pairs, which one multiplies to ${ac} and adds to give ${b}? (Each number can be positive or negative.)`,
    choices: shuffle(pairChoices),
    explanationOnCorrect:
      ac < 0
        ? `${small} and ${big} are ${big - small} apart, so with one of them negative they can add to ${b}. The two blanks are for these numbers - next, their signs.`
        : `${small} + ${big} = ${small + big}, so with the same sign on both they can add to ${b}. The two blanks are for these numbers - next, their signs.`,
    sideList: { ...list, marked: chosen },
  });
  const fac = (u: number, v: number) => `(${x} ${signed(u)})(${x} ${signed(v)})`;
  const seen = new Set<string>();
  const signChoices: Choice[] = [];
  for (const [u, v] of [[p, q], [-p, -q], [Math.abs(p), Math.abs(q)], [-Math.abs(p), -Math.abs(q)], [Math.abs(p), -Math.abs(q)], [-Math.abs(p), Math.abs(q)]] as [number, number][]) {
    const key = [u, v].sort((m, k) => m - k).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    signChoices.push({ text: $(fac(u, v)), isCorrect: u === p && v === q, misconceptionTag: u === p && v === q ? null : "wrong_signs" });
  }
  steps.push({
    stepId: "factor_signs",
    rowUpdates: [{ slotId: "factored", row: factorLine(fac(p, q)) }],
    prompt: `The two numbers have to multiply to ${ac} and add to ${b}. Which signs make that work?`,
    choices: shuffle(signChoices.slice(0, 4)),
    explanationOnCorrect: `${paren(p)} × ${paren(q)} = ${ac} and ${paren(p)} + ${paren(q)} = ${b}, so ${quadText(1, b, ac, x)} factors as ${$(fac(p, q))}.`,
  });

  // ---------- 3. slide back: divide both numbers by a ----------
  const divided = `${overA(p, a, x)}${overA(q, a, x)}`;
  const dividedHl = `${overA(p, a, x, true)}${overA(q, a, x, true)}`;
  const dividedText = $(divided);
  // the line ax² + bx + c = 0 is on: its leading coefficient is called out
  // while the question is asked
  const tri = prelude?.trinomial ?? { slotId: "__initial__", row: initialRow };
  const lead = `${a}${x}^2`;
  const triHl: GridRow = { ...tri.row, cells: tri.row.cells.map((cell) => (cell.startsWith(lead) ? `${hlNum(a)}${cell.slice(String(a).length)}` : cell)) };
  steps.push({
    stepId: "slide_divide",
    rowUpdatesOnShow: [{ slotId: tri.slotId, row: triHl }],
    rowUpdates: [{ slotId: "factored", row: factorLine(dividedHl) }],
    prompt: `Now slide the ${a} back: divide both numbers by ${a}. Which is right?`,
    choices: shuffle<Choice>([
      { text: $(divided), isCorrect: true, misconceptionTag: null },
      { text: $(`(${x} ${signed(p * a)})(${x} ${signed(q * a)})`), isCorrect: false, misconceptionTag: "multiplies_instead_of_divides" },
      { text: $(`(\\dfrac{${x}}{${a}} ${signed(p)})(\\dfrac{${x}}{${a}} ${signed(q)})`), isCorrect: false, misconceptionTag: "divides_the_x" },
    ]),
    explanationOnCorrect: `We multiplied by ${a} to slip it over, so we divide both numbers by ${a} to slide it back: ${dividedText}.`,
  });

  // ---------- 4. reduce (when something reduces) ----------
  const reducesSomething = gcd(p, a) > 1 || gcd(q, a) > 1;
  const red = `${reducedTex(p, a, x)}${reducedTex(q, a, x)}`;
  if (reducesSomething) {
    const unreduced = `${overA(p, a, x)}${overA(q, a, x)}`;
    steps.push({
      stepId: "slide_reduce",
      rowUpdates: [{ slotId: "reduced", row: line(red) }],
      prompt: "Reduce the fractions. What does it become?",
      choices: shuffle<Choice>([
        { text: $(red), isCorrect: true, misconceptionTag: null },
        { text: $(unreduced.replace(/\\dfrac\{(\d+)\}\{(\d+)\}/g, "\\dfrac{$2}{$1}")), isCorrect: false, misconceptionTag: "flips_the_fraction" },
        { text: $(`(${x} ${signed(p)})(${x} ${signed(q)})`), isCorrect: false, misconceptionTag: "drops_the_denominator" },
      ]),
      explanationOnCorrect: [p, q]
        .filter((v) => gcd(v, a) > 1)
        .map((v) => {
          const { r, s } = reduced(v, a);
          return $(`\\dfrac{${Math.abs(v)}}{${a}} = ${s === 1 ? Math.abs(r) : `\\dfrac{${Math.abs(r)}}{${s}}`}`);
        })
        .join(" and ") + ".",
    });
  }

  // ---------- 5. bottoms up ----------
  const bottoms = `${bottomsTex(p, a, x)}${bottomsTex(q, a, x)}`;
  const bad1 = `${reducedTex(p, a, x).replace(/\\dfrac\{(\d+)\}\{(\d+)\}/, "$1")}${reducedTex(q, a, x).replace(/\\dfrac\{(\d+)\}\{(\d+)\}/, "$1")}`;
  steps.push({
    stepId: "bottoms_up",
    rowUpdates: [{ slotId: "bottoms_up", row: line(bottoms, fo ? "success" : undefined) }],
    prompt: "Bottoms slide: the bottom number of a fraction that's left slides to the front of the x. What does it become?",
    choices: withCorrect($(bottoms), dedup($(bottoms), [
      { text: $(bad1), tag: "drops_the_denominator" },
      {
        text: $(
          [p, q]
            .map((v) => {
              const { r, s } = reduced(v, a);
              return `(${x} ${signed(r * s)})`;
            })
            .join("")
        ),
        tag: "multiplies_the_number",
      },
    ], 2)),
    explanationOnCorrect: `The denominator slides in front of the x: ${[p, q]
      .filter((v) => reduced(v, a).s !== 1)
      .map((v) => {
        const { r, s } = reduced(v, a);
        return `${$(`${x} ${r < 0 ? "-" : "+"} \\dfrac{${Math.abs(r)}}{${s}}`)} becomes ${$(`${s}${x} ${signed(r)}`)}`;
      })
      .join(", and ")}. So it factors as ${$(bottoms)}.`,
  });

  // (factoring only: the factored form is the answer)
  if (fo) return { initialRow, steps, ...EXPR_LAYOUT };

  // ---------- 6. zero product, then solve both ----------
  const f1 = reduced(p, a);
  const f2 = reduced(q, a);
  const split: GridRow = {
    cells: zl
      ? ["0", REL(EQ), renderMultiplyTerm(f1.s, x), renderConstant(f1.r, true), JOIN("or"), "0", REL(EQ), renderMultiplyTerm(f2.s, x), renderConstant(f2.r, true)]
      : [renderMultiplyTerm(f1.s, x), renderConstant(f1.r, true), REL(EQ), "0", JOIN("or"), renderMultiplyTerm(f2.s, x), renderConstant(f2.r, true), REL(EQ), "0"],
  };
  const ans = `${bottomsText(p, a, x)} = 0 or ${bottomsText(q, a, x)} = 0`;
  steps.push({
    stepId: "factor_zero_product",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `If two factors multiply to 0, one of them has to be 0. Which two equations does ${$(eq0(bottoms))} make?`,
    choices: withCorrect(ans, dedup(ans, [
      { text: `${x} = ${p} or ${x} = ${q}`, tag: "takes_numbers_as_answers" },
      { text: `${bottomsText(p, a, x)} = 0 only`, tag: "forgot_second_factor" },
      { text: `${x} ${signed(p)} = 0 or ${x} ${signed(q)} = 0`, tag: "uses_the_slipped_factors" },
    ], 2)),
    explanationOnCorrect: `The only way a product is 0 is if one of the factors is 0. So ${ans}.`,
  });

  if (zl) {
    const zp = steps[steps.length - 1];
    zp.choices = zp.choices.map((ch) => ({ ...ch, text: zeroLeftText(ch.text) }));
    zp.explanationOnCorrect = `The only way a product is 0 is if one of the factors is 0. So ${zeroLeftText(ans)}.`;
  }
  return buildTwoPart(
    { kind: "twoPart", join: "or", p1: { a: f1.s, b: f1.r, sym: EQ, rhs: 0 }, p2: { a: f2.s, b: f2.r, sym: EQ, rhs: 0 } },
    x,
    { equation: true, varRightAll: zl, lead: { initialRow, steps, startSlot: "split" } }
  );
}

// ---------- practice problems ----------
// Built from the answer: (s1 x + r1)(s2 x + r2) with whole numbers.
export function generateSlipProblem(): SlipProblem {
  for (;;) {
    const s1 = randInt(1, 3);
    const s2 = randInt(1, 3);
    if (s1 * s2 < 2) continue;
    const r1 = randInt(-7, 7);
    const r2 = randInt(-7, 7);
    if (r1 === 0 || r2 === 0) continue;
    if (gcd(s1, r1) !== 1 || gcd(s2, r2) !== 1) continue;
    const a = s1 * s2;
    const b = s1 * r2 + s2 * r1;
    const c = r1 * r2;
    const prob = { a, b, c };
    // (no x term, like 4x² - 1 = 0, is Square & Cube Roots)
    if (b === 0 || Math.abs(a * c) > 72 || !slipNumbers(prob)) continue;
    return prob;
  }
}

export function generateSlipInstance(): SolverInstance {
  return buildSlipInstance(generateSlipProblem());
}
