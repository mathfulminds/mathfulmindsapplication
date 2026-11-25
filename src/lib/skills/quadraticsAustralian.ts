// Quadratics by factoring with a number in front of x² - the Australian
// method:  6x² + 11x + 3 = 0.
//
//   1. Multiply a and c: 6 · 3 = 18 (written beside the work).
//   2. The factor pairs of 18 beside the work, the pair that adds to 11, the
//      signs: +2 and +9.
//   3. The setup: ax in front of each number, all over a:
//        (6x + 2)(6x + 9) / 6 = 0
//   4. For each parenthesis: its GCF, then the parenthesis divided by it:
//        2(3x + 1) · 3(2x + 3) / 6 = 0
//      (a GCF of 1 is still asked for; the parenthesis then stays as it is)
//   5. Multiply the numbers in front: 6(3x + 1)(2x + 3) / 6 = 0
//   6. 6 ÷ 6 = 1 (both crossed out): (3x + 1)(2x + 3) = 0
//   7. Zero product: 3x + 1 = 0 or 2x + 3 = 0, both solved side by side.
//
// A second way to work the same problems as slip and slide
// (quadraticsSlipSlide.ts): same problems, same answers.

import type { SolverInstance, SolverStep, Choice, GridRow, SideList } from "./types";
import { BLANK, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import type { ComparisonSymbol } from "./inequalityCore";
import { REL, JOIN, buildTwoPart, withCorrect, dedup } from "./compoundInequalities";
import { factorPairs, zeroLeftText, zeroLeftLine } from "./quadraticsFactoring";
import { slipNumbers, quadTex, hlNum, generateSlipProblem, type SlipProblem } from "./quadraticsSlipSlide";

const EQ = "=" as unknown as ComparisonSymbol;
const $ = (t: string) => `$${t}$`;
const paren = (n: number) => (n < 0 ? `(${n})` : `${n}`);
const signed = (n: number) => `${n < 0 ? "-" : "+"} ${Math.abs(n)}`;
const plus = (n: number) => `${n < 0 ? "-" : "+"}${Math.abs(n)}`;
const gcd = (m: number, n: number): number => {
  m = Math.abs(m);
  n = Math.abs(n);
  while (n) [m, n] = [n, m % n];
  return m;
};
// a number called out in bold red: the numbers that multiply, then divide away
const redNum = (n: number) => `\\textcolor{#e2574c}{\\mathbf{${n}}}`;
// StepSolver: a fraction whose bold number on top and number underneath are crossed out
const CROSSFRAC = "CROSSFRAC:";

export function buildAustralianInstance(
  prob: SlipProblem,
  x: string = "x",
  // steps that get it ready first (one side 0, a GCF out) - the same as slip and slide
  prelude?: { initialRow: GridRow; steps: SolverStep[]; trinomial?: { slotId: string; row: GridRow }; zeroLeft?: boolean }
): SolverInstance {
  const zl = !!prelude?.zeroLeft;
  const eq0 = (t: string) => (zl ? `0 = ${t}` : `${t} = 0`);
  const { a, b, c } = prob;
  const fn = slipNumbers(prob);
  if (!fn) throw new Error("the Australian method doesn't apply");
  const [p, q] = fn;
  const ac = a * c;
  const n = Math.abs(ac);
  const pairs = factorPairs(n);
  const pairText = ([d, e]: [number, number]) => `${d} and ${e}`;
  const chosen = pairs.findIndex(([d, e]) => (d === Math.abs(p) && e === Math.abs(q)) || (d === Math.abs(q) && e === Math.abs(p)));
  const g1 = gcd(a, p);
  const g2 = gcd(a, q);
  // (with no common factor in ax² + bx + c, the two GCFs always multiply back to a)
  if (g1 * g2 !== a) throw new Error("the Australian method doesn't apply");

  const line = (term: string): GridRow =>
    zl ? zeroLeftLine("0", term) : { cells: [term, BLANK, REL(EQ), "0", BLANK, BLANK, BLANK, BLANK, BLANK], spanNext: [0], noWidthCols: [0, 3] };
  // (a line that is a fraction: lined up so the "= 0" sits level with its bar)
  const fracLine = (term: string): GridRow => ({ ...line(term), baseline: true });
  const initialRow = prelude ? prelude.initialRow : line(quadTex(a, b, c, x));
  const steps: SolverStep[] = prelude ? [...prelude.steps] : [];

  // ---------- 1. a times c ----------
  const product = `${a} \\cdot ${paren(c)} = ${ac}`;
  const noteOnly: SideList = { title: `Factor pairs of ${n}`, items: [], note: product };
  steps.push({
    stepId: "aus_multiply",
    rowUpdates: [],
    prompt: `Multiply the first and last numbers. What is ${$(`${a} \\cdot ${paren(c)}`)}?`,
    choices: withCorrect(`${ac}`, dedup(`${ac}`, [
      { text: `${a + c}`, tag: "adds_instead_of_multiplies" },
      { text: `${-ac}`, tag: "sign_error" },
      { text: `${c}`, tag: "forgot_to_multiply" },
    ], 2)),
    explanationOnCorrect: `${$(product)}. It's written beside the problem.`,
    sideList: noteOnly,
  });

  // ---------- 2. the factor pairs, the pair, the signs ----------
  const list: SideList = { ...noteOnly, items: pairs.map(([d, e]) => `${d} \\cdot ${e}`) };
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
    explanationOnCorrect: `${pairs.map(([d, e]) => $(`${d} \\cdot ${e}`)).join(", ")} ${pairs.length > 1 ? "all make" : "makes"} ${n}. They're listed beside the problem.`,
    sideList: list,
  });
  const near = pairs.map((pr, i) => ({ pr, i })).sort((u, v) => Math.abs(u.i - chosen) - Math.abs(v.i - chosen)).slice(0, 4);
  const pairChoices: Choice[] = near.map(({ pr, i }) => ({ text: pairText(pr), isCorrect: i === chosen, misconceptionTag: i === chosen ? null : "wrong_factor_pair" }));
  if (pairChoices.length < 2) pairChoices.push({ text: "None of them", isCorrect: false, misconceptionTag: "wrong_factor_pair" });
  const [small, big] = [Math.min(Math.abs(p), Math.abs(q)), Math.max(Math.abs(p), Math.abs(q))];
  steps.push({
    stepId: "factor_pick_pair",
    rowUpdates: [],
    prompt: `Of these factor pairs, which one multiplies to ${ac} and adds to give ${b}? (Each number can be positive or negative.)`,
    choices: shuffle(pairChoices),
    explanationOnCorrect:
      ac < 0
        ? `${small} and ${big} are ${big - small} apart, so with one of them negative they can add to ${b}. Next, their signs.`
        : `${small} + ${big} = ${small + big}, so with the same sign on both they can add to ${b}. Next, their signs.`,
    sideList: { ...list, marked: chosen },
  });
  const ax = `${a}${x}`;
  // (ax + p); with `hl`, its two numbers are called out in bold blue
  const factor = (v: number, hl = false) => (hl ? `(${hlNum(a)}${x} ${v < 0 ? "-" : "+"} ${hlNum(Math.abs(v))})` : `(${ax} ${signed(v)})`);
  const setup = (hl1 = false, hl2 = false) => `\\dfrac{${factor(p, hl1)}${factor(q, hl2)}}{${a}}`;
  // The setup line as it first appears, once the two numbers and their signs
  // are known: "(   + 2)(   + 9)" with the rest - the ax in each parenthesis,
  // the bar, the number under it, the "= 0" - not written yet. It is drawn
  // as the finished line with those parts unseen, so the numbers are already
  // where they will stay.
  const unseen = (t: string) => `\\textcolor{transparent}{${t}}`;
  // (a fraction with no bar drawn - \genfrac with a 0pt bar - whose missing
  // parts are \phantom: nothing here depends on colors inside colors, which
  // Safari doesn't draw the way other browsers do)
  const blankFactor = (v: number) => `(\\phantom{${ax}}{} ${signed(v)})`;
  const blanksMath = `\\genfrac{}{}{0pt}{0}{${blankFactor(p)}${blankFactor(q)}}{\\phantom{${a}}}`;
  const blanksRow: GridRow = (() => {
    const row = fracLine(blanksMath);
    // (the "=" and the 0 on this line wait too)
    return { ...row, cells: row.cells.map((cell) => (cell === blanksMath || cell === BLANK ? cell : unseen(cell))) };
  })();
  const seen = new Set<string>();
  const signChoices: Choice[] = [];
  for (const [u, v] of [[p, q], [-p, -q], [Math.abs(p), Math.abs(q)], [-Math.abs(p), -Math.abs(q)], [Math.abs(p), -Math.abs(q)], [-Math.abs(p), Math.abs(q)]] as [number, number][]) {
    const key = `${u},${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signChoices.push({ text: `${$(plus(u))} and ${$(plus(v))}`, isCorrect: u === p && v === q, misconceptionTag: u === p && v === q ? null : "wrong_signs" });
  }
  steps.push({
    stepId: "factor_signs",
    rowUpdates: [{ slotId: "aus_setup", row: blanksRow }],
    prompt: `The two numbers have to multiply to ${ac} and add to ${b}. Which signs make that work?`,
    choices: shuffle(signChoices.slice(0, 4)),
    explanationOnCorrect: `${$(`${paren(p)} \\cdot ${paren(q)} = ${ac}`)} and ${$(`${paren(p)} + ${paren(q)} = ${b}`)}.`,
    sideList: { ...list, marked: chosen },
  });

  // ---------- 3. the setup ----------
  steps.push({
    stepId: "aus_setup",
    rowUpdates: [{ slotId: "aus_setup", row: fracLine(setup()) }],
    prompt: `Put ${$(ax)} in front of each number, all over ${$(`${a}`)}. Which setup is right?`,
    choices: shuffle<Choice>([
      { text: $(setup()), isCorrect: true, misconceptionTag: null },
      { text: $(`\\dfrac{(${x} ${signed(p)})(${x} ${signed(q)})}{${a}}`), isCorrect: false, misconceptionTag: "left_out_the_leading_number" },
      { text: $(`${factor(p)}${factor(q)}`), isCorrect: false, misconceptionTag: "forgot_to_divide_by_a" },
    ]),
    explanationOnCorrect: `Both parentheses start with ${$(ax)}. That makes it ${a} times too big, so the whole thing is divided by ${a}.`,
  });

  // ---------- 4. each parenthesis: its GCF, then divided by it ----------
  // what's left of (ax + v) once its GCF g is out: "3x + 1"
  const insideText = (v: number, g: number) => `${renderMultiplyTerm(a / g, x)} ${signed(v / g)}`;
  // "2(3x + 1)", or "(x + 3)" when the GCF is 1; with `red`, the number in front in bold red
  const part = (v: number, g: number, red = false) => `${g > 1 ? (red ? redNum(g) : `${g}`) : ""}(${insideText(v, g)})`;
  const dot = g2 > 1 ? " \\cdot " : "";
  // the line under the setup: its second parenthesis isn't written (its room
  // is held) until its own questions are answered
  const factored = (upTo: 1 | 2, red = false, redBottom = false) =>
    `\\dfrac{${part(p, g1, red)}${upTo === 2 ? `${dot}${part(q, g2, red)}` : `\\phantom{${dot}${part(q, g2)}}`}}{${redBottom ? redNum(a) : a}}`;
  ([[p, g1, 1], [q, g2, 2]] as [number, number, 1 | 2][]).forEach(([v, g, i]) => {
    const absV = Math.abs(v);
    const hlSetup: GridRow = fracLine(setup(true, i === 2));
    const done: GridRow = fracLine(factored(i));
    steps.push({
      stepId: `aus_gcf_${i}`,
      rowUpdatesOnShow: [{ slotId: "aus_setup", row: hlSetup }],
      // (a GCF of 1: nothing to divide by, so the parenthesis comes down as it is)
      rowUpdates: g === 1 ? [{ slotId: "aus_factored", row: done }] : [],
      prompt: `What is the GCF of ${$(`${hlNum(a)}${x}`)} and ${$(hlNum(absV))}?`,
      choices: withCorrect(`${g}`, dedup(`${g}`, [
        ...[a, absV, 2 * g].filter((k) => k !== g).map((k) => ({ text: `${k}`, tag: "not_a_factor_of_every_term" })),
        ...(g !== 1 ? [{ text: "1", tag: "missed_the_gcf" }] : []),
        { text: `${g + 1}`, tag: "not_a_factor_of_every_term" },
      ], 2)),
      explanationOnCorrect:
        g === 1
          ? `Only 1 goes into both ${a} and ${absV}, so ${$(factor(v))} stays the same.`
          : `${g} is the greatest number that goes into both ${a} and ${absV}.`,
    });
    if (g === 1) return;
    steps.push({
      stepId: `aus_divide_${i}`,
      rowUpdates: [{ slotId: "aus_factored", row: done }],
      prompt: `What is ${$(`\\dfrac{${ax} ${signed(v)}}{${g}}`)}?`,
      choices: withCorrect($(insideText(v, g)), dedup($(insideText(v, g)), [
        { text: $(`${renderMultiplyTerm(a / g, x)} ${signed(v)}`), tag: "divides_only_one_term" },
        { text: $(`${ax} ${signed(v / g)}`), tag: "divides_only_one_term" },
        { text: $(`${renderMultiplyTerm(a / g, x)} ${signed(-v / g)}`), tag: "sign_error" },
      ], 2)),
      explanationOnCorrect: `${$(`${ax} \\div ${g} = ${renderMultiplyTerm(a / g, x)}`)} and ${$(`${paren(v)} \\div ${g} = ${v / g}`)}, so ${$(factor(v))} is the same as ${$(part(v, g))}.`,
    });
  });

  // ---------- 5. multiply the numbers in front (when there are two) ----------
  const inner = `(${insideText(p, g1)})(${insideText(q, g2)})`;
  const combined = (redBottom = false) => `\\dfrac{${redNum(a)}${inner}}{${redBottom ? redNum(a) : a}}`;
  const two = g1 > 1 && g2 > 1;
  if (two) {
    steps.push({
      stepId: "aus_multiply_gcfs",
      rowUpdatesOnShow: [{ slotId: "aus_factored", row: fracLine(factored(2, true)) }],
      rowUpdates: [{ slotId: "aus_combined", row: fracLine(combined()) }],
      prompt: `Multiply the numbers in front. What is ${$(`${redNum(g1)} \\cdot ${redNum(g2)}`)}?`,
      choices: withCorrect(`${a}`, dedup(`${a}`, [
        { text: `${g1 + g2}`, tag: "adds_instead_of_multiplies" },
        { text: `${a + 1}`, tag: "arithmetic_slip" },
        { text: `${a * 2}`, tag: "arithmetic_slip" },
      ], 2)),
      explanationOnCorrect: `${$(`${g1} \\cdot ${g2} = ${a}`)}. Multiplying can be done in any order, so the ${a} goes in front.`,
    });
  }

  // ---------- 6. a ÷ a = 1 ----------
  // (the line with the number on top: the combined one, or - with only one
  // number in front - the factored line itself)
  const topSlot = two ? "aus_combined" : "aus_factored";
  const topMath = two ? combined(true) : factored(2, true, true);
  steps.push({
    stepId: "aus_divide_a",
    rowUpdatesOnShow: [{ slotId: topSlot, row: fracLine(topMath) }],
    rowUpdates: [
      // (crossed out, the two numbers stay bold red)
      { slotId: topSlot, row: fracLine(`${CROSSFRAC}${topMath}`) },
      { slotId: "aus_done", row: line(inner) },
    ],
    prompt: `What is ${$(`${redNum(a)} \\div ${redNum(a)}`)}?`,
    choices: withCorrect("1", [
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${a}`, tag: "forgot_to_apply_operation" },
    ]),
    explanationOnCorrect: `A number divided by itself is 1, so ${$(quadTex(a, b, c, x))} factors as ${$(inner)}.`,
  });

  // ---------- 7. zero product, then solve both ----------
  const f1 = { s: a / g1, r: p / g1 };
  const f2 = { s: a / g2, r: q / g2 };
  const split: GridRow = {
    cells: zl
      ? ["0", REL(EQ), renderMultiplyTerm(f1.s, x), renderConstant(f1.r, true), JOIN("or"), "0", REL(EQ), renderMultiplyTerm(f2.s, x), renderConstant(f2.r, true)]
      : [renderMultiplyTerm(f1.s, x), renderConstant(f1.r, true), REL(EQ), "0", JOIN("or"), renderMultiplyTerm(f2.s, x), renderConstant(f2.r, true), REL(EQ), "0"],
  };
  const ans = `${insideText(p, g1)} = 0 or ${insideText(q, g2)} = 0`;
  steps.push({
    stepId: "factor_zero_product",
    rowUpdates: [{ slotId: "split", row: split }],
    prompt: `If two factors multiply to 0, one of them has to be 0. Which two equations does ${$(eq0(inner))} make?`,
    choices: withCorrect(ans, dedup(ans, [
      { text: `${x} = ${p} or ${x} = ${q}`, tag: "takes_numbers_as_answers" },
      { text: `${insideText(p, g1)} = 0 only`, tag: "forgot_second_factor" },
      { text: `${ax} ${signed(p)} = 0 or ${ax} ${signed(q)} = 0`, tag: "uses_the_setup_factors" },
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
// The same problems as slip and slide.
export function generateAustralianInstance(): SolverInstance {
  return buildAustralianInstance(generateSlipProblem());
}
