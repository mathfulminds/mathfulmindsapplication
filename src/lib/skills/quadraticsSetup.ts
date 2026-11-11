// Getting a quadratic ready to factor, before Quadratics by Factoring or
// slip and slide take over:
//
//   1. Everything on one side:  x² + 5x = -6  ->  (+6 under both sides)  ->
//      x² + 5x + 6 = 0. The side without x² is the one that's cleared, so
//      the x² stays positive (12 = x² + x  ->  0 = x² + x - 12).
//   2. A common factor comes out first:
//        2x² + 6x + 4 = 0  ->  2(x² + 3x + 2) = 0  ->  divide both sides by 2
//        (in place)  ->  x² + 3x + 2 = 0, then factor that.
//        2x² + 6x = 0 (no number on its own)  ->  2x(x + 3) = 0  ->
//        2x = 0 or x + 3 = 0.

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { moveTag } from "./types";
import { BLANK, renderMultiplyTerm, renderConstant, shuffle } from "./isolateVariableCore";
import type { ComparisonSymbol } from "./inequalityCore";
import { REL, JOIN, buildTwoPart, withCorrect, dedup, divideChoices, coefficientOneStep } from "./compoundInequalities";
import { buildFactorInstance, factorNumbers, generateFactorProblem, zeroLeftText, zeroLeftLine } from "./quadraticsFactoring";
import { buildSlipInstance, slipNumbers, generateSlipProblem } from "./quadraticsSlipSlide";

export interface QuadTerm {
  coef: number;
  pow: 0 | 1 | 2;
}
// Each side as typed, term by term, in order.
export interface QuadInput {
  left: QuadTerm[];
  right: QuadTerm[];
}
export interface Prelude {
  initialRow: GridRow;
  steps: SolverStep[];
  // the line ax² + bx + c = 0 ends up on
  trinomial?: { slotId: string; row: GridRow };
  // the 0 ended up on the left ("0 = x² + x - 12"), and stays there
  zeroLeft?: boolean;
}

const EQ = "=" as unknown as ComparisonSymbol;
const $ = (t: string) => `$${t}$`;
const gcd = (m: number, n: number): number => {
  m = Math.abs(m);
  n = Math.abs(n);
  while (n) [m, n] = [n, m % n];
  return m;
};

const mono = (coef: number, pow: number, x: string) => {
  const a = Math.abs(coef);
  if (pow === 0) return `${a}`;
  const v = pow === 2 ? `${x}^2` : x;
  return a === 1 ? v : `${a}${v}`;
};
// a side as written: "x^2 + 5x - 6", "0" when empty
export function sideTex(terms: QuadTerm[], x: string): string {
  const live = terms.filter((t) => t.coef !== 0);
  if (!live.length) return "0";
  return live.map((t, i) => (i === 0 ? `${t.coef < 0 ? "-" : ""}${mono(t.coef, t.pow, x)}` : ` ${t.coef < 0 ? "-" : "+"} ${mono(t.coef, t.pow, x)}`)).join("");
}
// notes under a side: every term with its sign ("-3x - 10", "+6")
const notesTex = (terms: QuadTerm[], x: string) =>
  terms
    .filter((t) => t.coef !== 0)
    .map((t, i) => `${i === 0 ? "" : " "}${t.coef < 0 ? "-" : "+"}${i === 0 ? "" : " "}${mono(t.coef, t.pow, x)}`)
    .join("");
// a term's tex without its sign, coefficient 1 left off ("x^2", "3x", "6")
const monoTex = (coef: number, pow: number, x: string) => mono(coef, pow, x);
// the same for text ("x²")
const monoText = (coef: number, pow: number, x: string) => mono(coef, pow, x).replace("^2", "²");
// Terms written one after another, with the ones not shown yet still taking
// up their room (invisible), so nothing moves as each one appears. Every
// term after the first is its own group with an empty left side, so its
// + or - is spaced the same whether it's showing or not. Notes ("-x - 3")
// write the first sign too.
function seqTex(terms: QuadTerm[], shown: (i: number) => boolean, x: string, notesStyle = false): string {
  return terms
    .map((t, i) => {
      const body = mono(t.coef, t.pow, x);
      const tex = i === 0 ? `${t.coef < 0 ? "-" : notesStyle ? "+" : ""}${body}` : `{{} ${t.coef < 0 ? "-" : "+"} ${body}}`;
      return shown(i) ? tex : `\\textcolor{transparent}{${tex}}`;
    })
    .join("");
}
const trinomial = (a: number, b: number, c: number): QuadTerm[] => [
  { coef: a, pow: 2 },
  { coef: b, pow: 1 },
  { coef: c, pow: 0 },
];
const sum = (terms: QuadTerm[], pow: number) => terms.filter((t) => t.pow === pow).reduce((s, t) => s + t.coef, 0);

// ax² + bx + c = 0 with a > 0 (the side without x² moves over), and
// whether anything had to move.
export function standardForm(q: QuadInput): { a: number; b: number; c: number; flip: boolean; moved: boolean } {
  let [a, b, c] = [2, 1, 0].map((p) => sum(q.left, p) - sum(q.right, p));
  const flip = a < 0;
  if (flip) [a, b, c] = [-a, -b, -c];
  const cleared = flip ? q.left : q.right;
  return { a, b, c, flip, moved: cleared.some((t) => t.coef !== 0) };
}

// Why this one can't be done here, or null.
export function quadProblemError(q: QuadInput): string | null {
  const { a, b, c } = standardForm(q);
  if (a === 0) return "Once everything is on one side, the x² terms cancel out - that's a linear equation, not a quadratic.";
  if (b === 0) return "Once everything is on one side, there's no x term - solve that one with Quadratics by square roots (get x² by itself, then take the square root).";
  if (c === 0) return null; // x(ax + b) = 0 always works
  const g = gcd(gcd(a, b), c);
  const [ia, ib, ic] = [a / g, b / g, c / g];
  if (ia === 1) {
    const nums = factorNumbers(ib, ic);
    if (!nums) return `No two whole numbers multiply to ${ic} and add to ${ib}, so this one doesn't factor - that kind isn't supported yet (it needs the quadratic formula).`;
    if (nums[0] === nums[1]) return `This one factors as (x ${nums[0] < 0 ? "-" : "+"} ${Math.abs(nums[0])})², so both answers are the same - that kind isn't supported yet.`;
    return null;
  }
  if (!slipNumbers({ a: ia, b: ib, c: ic })) {
    const nums = factorNumbers(ib, ia * ic);
    if (nums && nums[0] === nums[1]) return "Both answers come out the same here (it's a perfect square) - that kind isn't supported yet.";
    return `No two whole numbers multiply to ${ia * ic} and add to ${ib}, so this one doesn't factor - that kind isn't supported yet (it needs the quadratic formula).`;
  }
  return null;
}

// Which skill solves it once it's set up.
export function quadSkill(q: QuadInput): "factor" | "slip" {
  const { a, b, c } = standardForm(q);
  if (c === 0) return "factor";
  const g = gcd(gcd(a, b), c);
  return a / g === 1 ? "factor" : "slip";
}

export function buildQuadraticInstance(q: QuadInput, x: string = "x"): SolverInstance {
  const err = quadProblemError(q);
  if (err) throw new Error(err);
  const { a, b, c, flip, moved } = standardForm(q);
  // (with x² on the right only, the 0 ends up - and stays - on the left)
  const line = (left: string, right = "0"): GridRow =>
    flip ? zeroLeftLine(left, right) : { cells: [left, BLANK, REL(EQ), right, BLANK, BLANK, BLANK, BLANK, BLANK], spanNext: [0], noWidthCols: [0, 3] };
  const L = sideTex(q.left, x);
  const R = sideTex(q.right, x);
  let initialRow = line(L, R);
  const steps: SolverStep[] = [];
  const std = sideTex(trinomial(a, b, c), x);

  // ---------- 1. everything on one side, one term at a time ----------
  // Each term on the side being cleared is carried across with an arrow
  // (labeled with what's done to both sides, "-6x"), one question per term.
  // The next line is the other side with those terms written on the end;
  // then like terms are combined, one kind at a time.
  const stdTerms = trinomial(a, b, c).filter((t) => t.coef !== 0);
  let trinomialAt: { slotId: string; row: GridRow } | undefined;
  if (moved) {
    const cleared = (flip ? q.left : q.right).filter((t) => t.coef !== 0);
    const kept = (flip ? q.right : q.left).filter((t) => t.coef !== 0);
    const opp = cleared.map((t) => ({ ...t, coef: -t.coef }));
    const sideName = flip ? "left" : "right";
    const otherName = flip ? "right" : "left";
    const BLUE = "#2e6fa3";
    // the problem's line: each term that moves is tagged, so its arrow
    // starts right at it
    const taggedSide = cleared
      .map((t, i) => {
        const body = `\\textcolor{${moveTag(i)}}{${mono(t.coef, t.pow, x)}}`;
        return i === 0 ? `${t.coef < 0 ? "-" : ""}${body}` : `{{} ${t.coef < 0 ? "-" : "+"} ${body}}`;
      })
      .join("");
    const labels = opp.map((t) => `${t.coef < 0 ? "-" : "+"}${mono(t.coef, t.pow, x)}`);
    const problemRow = (count: number): GridRow => ({
      ...(flip ? line(taggedSide, R) : line(L, taggedSide)),
      moveArrows: { count, labels, to: flip ? "right" : "left", sideCols: flip ? [0, 2] : [0, 3] },
    });
    initialRow = problemRow(0);
    // the kept side with the moved terms (blue) written on the end; the ones
    // not moved yet hold their room, so nothing shifts as each one arrives
    const piece = (t: QuadTerm, first: boolean) => (first ? `${t.coef < 0 ? "-" : ""}${mono(t.coef, t.pow, x)}` : `{{} ${t.coef < 0 ? "-" : "+"} ${mono(t.coef, t.pow, x)}}`);
    const carried = (k: number) =>
      [...kept.map((t, i) => piece(t, i === 0)), ...opp.map((t, j) => `\\textcolor{${j < k ? BLUE : "transparent"}}{${piece(t, kept.length === 0 && j === 0)}}`)].join("");
    const carriedRow = (k: number): GridRow => {
      const rest = sideTex(cleared.slice(k), x);
      return flip ? line(rest, carried(k)) : line(carried(k), rest);
    };
    cleared.forEach((t, i) => {
      const body = monoText(t.coef, t.pow, x);
      const named = `${t.coef < 0 ? "-" : i === 0 ? "" : "+"}${body}`;
      const sub = t.coef > 0;
      const verb = (s2: boolean) => (s2 ? `Subtracting ${body} from` : `Adding ${body} to`);
      const intro = i === 0 ? `To factor, one side has to be 0, so each term on the ${sideName} moves to the ${otherName}. ` : "";
      steps.push({
        stepId: i === 0 ? "setup_move_goal" : `setup_move_goal_${i + 1}`,
        rowUpdates: [
          { slotId: "__initial__", row: problemRow(i + 1) },
          { slotId: "setup_moved", row: carriedRow(i + 1) },
        ],
        prompt: `${intro}To move the ${named}, what do we do to both sides?`,
        choices: shuffle<Choice>([
          { text: `${verb(sub)} both sides`, isCorrect: true, misconceptionTag: null },
          { text: `${verb(!sub)} both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
          { text: `${verb(sub)} the ${sideName} side only`, isCorrect: false, misconceptionTag: "one_side_only" },
        ]),
        explanationOnCorrect: `${verb(sub)} both sides takes it off the ${sideName} and writes it as ${$(labels[i])} on the ${otherName}.${i === cleared.length - 1 ? ` The ${sideName} side is now 0.` : ""}`,
      });
    });
    const carriedFinal = carriedRow(cleared.length);

    // combine like terms, one kind at a time; a term with nothing to
    // combine with just comes down
    const finalLine = (shown: (pow: number) => boolean): GridRow => {
      const t = seqTex(stdTerms, (i) => shown(stdTerms[i].pow), x);
      return flip ? line("0", t) : line(t);
    };
    const pows = [2, 1, 0].filter((pw) => kept.filter((t) => t.pow === pw).length + opp.filter((t) => t.pow === pw).length >= 2);
    const order = [...kept, ...opp].map((t) => t.pow);
    const inOrder = order.every((pw, i) => i === 0 || pw < order[i - 1]);
    const finalText = flip ? `0 = ${sideTex(stdTerms, x)}` : `${sideTex(stdTerms, x)} = 0`;
    if (!pows.length && inOrder) {
      // already ax² + bx + c = 0: nothing more to do here
      trinomialAt = { slotId: "setup_moved", row: carriedFinal };
    } else if (!pows.length) {
      const eqText = (t: QuadTerm[]) => (flip ? `0 = ${sideTex(t, x)}` : `${sideTex(t, x)} = 0`);
      const right = $(finalText);
      steps.push({
        stepId: "setup_move_order",
        rowUpdates: [{ slotId: "setup_combined", row: finalLine(() => true) }],
        prompt: `Nothing combines, so write the terms in order: ${x}² first, then ${x}, then the number. What does the equation become?`,
        choices: withCorrect(right, dedup(right, [
          { text: $(eqText(trinomial(a, -b, c))), tag: "sign_error" },
          ...(c !== 0 ? [{ text: $(eqText(trinomial(a, b, -c))), tag: "sign_error" }] : []),
          { text: $(eqText(trinomial(a, -b, -c))), tag: "sign_error" },
        ], 2)),
        explanationOnCorrect: `In order: ${$(finalText)}.`,
      });
      trinomialAt = { slotId: "setup_combined", row: finalLine(() => true) };
    } else {
      const done = new Set<number>();
      pows.forEach((pw, j) => {
        const parts = [...kept.filter((t) => t.pow === pw), ...opp.filter((t) => t.pow === pw)];
        const expr = parts.map((t, i) => (i === 0 ? `${t.coef < 0 ? "-" : ""}${monoTex(t.coef, pw, x)}` : ` ${t.coef < 0 ? "-" : "+"} ${monoTex(t.coef, pw, x)}`)).join("");
        const v = parts.reduce((s2, t) => s2 + t.coef, 0);
        const keptSum = kept.filter((t) => t.pow === pw).reduce((s2, t) => s2 + t.coef, 0);
        const oppSum = opp.filter((t) => t.pow === pw).reduce((s2, t) => s2 + t.coef, 0);
        const val = (n: number) => $(n === 0 ? "0" : `${n < 0 ? "-" : ""}${monoTex(n, pw, x)}`);
        done.add(pw);
        const last = j === pows.length - 1;
        steps.push({
          stepId: j === 0 ? "setup_move_combine" : `setup_move_combine_${j + 1}`,
          rowUpdates: [{ slotId: "setup_combined", row: finalLine((p2) => !pows.includes(p2) || done.has(p2)) }],
          prompt: `${j === 0 ? `Now combine like terms on the ${otherName}. ` : ""}What is ${$(expr)}?`,
          choices: withCorrect(val(v), dedup(val(v), [
            { text: val(keptSum - oppSum), tag: "flipped_the_operation" },
            { text: val(-v), tag: "sign_error" },
            { text: val(v + 1), tag: "arithmetic_slip" },
          ], 2)),
          explanationOnCorrect: `${$(expr)} combines to ${val(v)}.${last ? ` So the equation is ${$(finalText)}.` : ""}`,
        });
      });
      trinomialAt = { slotId: "setup_combined", row: finalLine(() => true) };
    }
  }
  const workLine = (t: string) => (flip ? line("0", t) : line(t));
  // (when the 0 ended up on the left, it stays on the left on every line)
  const zl = flip;
  const eq0 = (t: string) => (zl ? `0 = ${t}` : `${t} = 0`);
  const prelude = (): Prelude => ({ initialRow, steps, zeroLeft: zl, ...(trinomialAt ? { trinomial: trinomialAt } : {}) });

  // ---------- 2a. no number on its own: x is a common factor ----------
  if (c === 0) {
    const g = gcd(a, b);
    const [ia, ib] = [a / g, b / g];
    const gx = renderMultiplyTerm(g, x);
    const innerTerms: QuadTerm[] = [{ coef: ia, pow: 1 }, { coef: ib, pow: 0 }];
    const inner = sideTex(innerTerms, x);
    const factored = `${gx}(${inner})`;
    const ax2 = mono(a, 2, x);
    const bx = `${b < 0 ? "-" : ""}${mono(b, 1, x)}`;
    const partial = (k: number) => workLine(`${gx}(${seqTex(innerTerms, (i) => i < k, x)})`);
    steps.push({
      stepId: "gcf_x",
      rowUpdates: [{ slotId: "setup_gcf", row: partial(0) }],
      prompt: `There's no number on its own, so every term has an ${x} in it. What is the GCF of ${$(ax2)} and ${$(bx)}?`,
      choices: withCorrect($(gx), dedup($(gx), [
        { text: $(g === 1 ? `${x}^2` : x), tag: g === 1 ? "too_big_a_factor" : "missed_the_number" },
        ...(g > 1 ? [{ text: `${g}`, tag: "missed_the_x" }] : [{ text: "1", tag: "missed_the_x" }]),
        { text: $(renderMultiplyTerm(Math.abs(b), x)), tag: "too_big_a_factor" },
      ], 2)),
      explanationOnCorrect: `${$(gx)} goes into both terms, so it comes out in front. Next, what's left of each term.`,
    });
    // each term divided by the GCF
    const termTex = (n: number, pw: number) => `${n < 0 ? "-" : ""}${monoTex(n, pw, x)}`;
    const quotients: [number, number, number][] = [[a, 2, ia], [b, 1, ib]];
    quotients.forEach(([coef, pw, qv], k) => {
      const right = $(termTex(qv, pw - 1));
      steps.push({
        stepId: k === 0 ? "gcf_divide_term" : `gcf_divide_term_${k + 1}`,
        rowUpdates: [{ slotId: "setup_gcf", row: partial(k + 1) }],
        prompt: `What is ${$(`${termTex(coef, pw)} \\div ${gx}`)}?`,
        choices: withCorrect(right, dedup(right, [
          { text: $(termTex(qv, pw)), tag: "kept_the_x" },
          { text: $(termTex(-qv, pw - 1)), tag: "sign_error" },
          { text: $(termTex(coef, pw - 1)), tag: "divided_only_the_x" },
          { text: $(termTex(qv * 2 + 1, pw - 1)), tag: "arithmetic_slip" },
        ], 2)),
        explanationOnCorrect: `${$(`${termTex(coef, pw)} \\div ${gx} = ${termTex(qv, pw - 1)}`)}.${k === quotients.length - 1 ? ` So it factors as ${$(eq0(factored))}.` : ""}`,
      });
    });
    const zt = (t: string) => (zl ? zeroLeftText(t) : t);
    const split: GridRow = {
      cells: zl
        ? ["0", REL(EQ), gx, BLANK, JOIN("or"), "0", REL(EQ), renderMultiplyTerm(ia, x), renderConstant(ib, true)]
        : [gx, BLANK, REL(EQ), "0", JOIN("or"), renderMultiplyTerm(ia, x), renderConstant(ib, true), REL(EQ), "0"],
    };
    const innerText = sideTex(innerTerms, x);
    const ans = `${gx} = 0 or ${innerText} = 0`;
    steps.push({
      stepId: "factor_zero_product",
      rowUpdates: [{ slotId: "split", row: split }],
      prompt: `If two factors multiply to 0, one of them has to be 0. Which two equations does ${$(eq0(factored))} make?`,
      choices: withCorrect(zt(ans), dedup(zt(ans), [
        { text: zt(`${innerText} = 0 only`), tag: "divides_away_the_x" },
        { text: zt(`${gx} = 0 only`), tag: "forgot_second_factor" },
        { text: zt(`${gx} = ${ib} or ${innerText} = 0`), tag: "sets_factor_to_number" },
      ], 2)),
      explanationOnCorrect: `The only way a product is 0 is if one of the factors is 0. So ${zt(ans)}.`,
    });
    return buildTwoPart(
      { kind: "twoPart", join: "or", p1: { a: g, b: 0, sym: EQ, rhs: 0 }, p2: { a: ia, b: ib, sym: EQ, rhs: 0 } },
      x,
      { equation: true, varRightAll: zl, lead: { initialRow, steps, startSlot: "split" } }
    );
  }

  // ---------- 2b. a number that goes into every term ----------
  const g = gcd(gcd(a, b), c);
  let [ia, ib, ic] = [a, b, c];
  if (g > 1) {
    [ia, ib, ic] = [a / g, b / g, c / g];
    const innerTerms = trinomial(ia, ib, ic);
    const inner = sideTex(innerTerms, x);
    const factored = `${g}(${inner})`;
    const partial = (k: number) => workLine(`${g}(${seqTex(innerTerms, (i) => i < k, x)})`);
    const divisors = [...Array(g).keys()].map((k) => k + 1).filter((d) => d > 1 && d < g && g % d === 0);
    steps.push({
      stepId: "gcf_number",
      rowUpdates: [{ slotId: "setup_gcf", row: partial(0) }],
      prompt: `Before factoring, check for a GCF. What is the greatest number that goes into ${a}, ${b}, and ${c}?`,
      choices: withCorrect(`${g}`, dedup(`${g}`, [
        ...(divisors.length ? [{ text: `${divisors[divisors.length - 1]}`, tag: "not_the_greatest" }] : []),
        { text: "1", tag: "missed_the_gcf" },
        { text: `${g * 2}`, tag: "not_a_factor_of_every_term" },
      ], 2)),
      explanationOnCorrect: `${g} goes into ${a}, ${b}, and ${c}, so it comes out in front. Next, divide each term by ${g}.`,
    });
    // each term divided by the GCF
    const termTex = (n: number, pw: number) => (pw === 0 ? `${n}` : `${n < 0 ? "-" : ""}${monoTex(n, pw, x)}`);
    const quotients: [number, number, number][] = [[a, 2, ia], [b, 1, ib], [c, 0, ic]];
    quotients.forEach(([coef, pw, qv], k) => {
      const right = $(termTex(qv, pw));
      steps.push({
        stepId: k === 0 ? "gcf_divide_term" : `gcf_divide_term_${k + 1}`,
        rowUpdates: [{ slotId: "setup_gcf", row: partial(k + 1) }],
        prompt: `What is ${$(`${termTex(coef, pw)} \\div ${g}`)}?`,
        choices: withCorrect(right, dedup(right, [
          { text: $(termTex(coef * g, pw)), tag: "multiplied_instead" },
          { text: $(termTex(-qv, pw)), tag: "sign_error" },
          { text: $(termTex(coef - g, pw)), tag: "subtracted_instead" },
          { text: $(termTex(qv + 1, pw)), tag: "arithmetic_slip" },
        ], 2)),
        explanationOnCorrect: `${$(`${termTex(coef, pw)} \\div ${g} = ${termTex(qv, pw)}`)}.${k === quotients.length - 1 ? ` So it factors as ${$(eq0(factored))}.` : ""}`,
      });
    });
    const div = (marked: boolean): GridRow => {
      const top = marked ? `MARKEDFRACTION:${g}\u0006(${inner})\u0005${g}` : `\\dfrac{${factored}}{${g}}`;
      return zl ? line(`\\dfrac{0}{${g}}`, top) : line(top, `\\dfrac{0}{${g}}`);
    };
    steps.push({
      stepId: "gcf_divide",
      rowUpdates: [{ slotId: "setup_gcf", row: div(false) }],
      prompt: `What undoes multiplying by ${g}?`,
      choices: divideChoices(g, "both sides", 0),
      explanationOnCorrect: `Dividing both sides by ${g} cancels it (and 0 ÷ ${g} is still 0).`,
    });
    const co = coefficientOneStep(g, [
      { slotId: "setup_gcf", row: div(true) },
      { slotId: "setup_inner", row: workLine(inner) },
    ]);
    co.stepId = "gcf_cancel";
    co.explanationOnCorrect = `${g} ÷ ${g} = 1 and 0 ÷ ${g} = 0, so what's left to factor is ${$(eq0(inner))}.`;
    steps.push(co);
    trinomialAt = { slotId: "setup_inner", row: workLine(inner) };
  }

  if (!moved && g === 1 && !zl) return ia === 1 ? buildFactorInstance({ b: ib, c: ic }, x) : buildSlipInstance({ a: ia, b: ib, c: ic }, x);
  return ia === 1 ? buildFactorInstance({ b: ib, c: ic }, x, prelude()) : buildSlipInstance({ a: ia, b: ib, c: ic }, x, prelude());
}

// ---------- practice problems ----------
// Mostly ready to factor, but sometimes with a GCF to take out first, or a
// number on the right to move over.
function practice(a: number, b: number, c: number): QuadInput {
  const r = Math.random();
  if (r < 0.2) {
    const g = Math.random() < 0.6 ? 2 : 3;
    return { left: trinomial(g * a, g * b, g * c).filter((t) => t.coef !== 0), right: [] };
  }
  if (r < 0.4) {
    // the constant (and sometimes the x term) on the right
    const both = Math.random() < 0.3;
    return {
      left: [{ coef: a, pow: 2 }, ...(both ? [] : [{ coef: b, pow: 1 as const }])],
      right: [...(both ? [{ coef: -b, pow: 1 as const }] : []), { coef: -c, pow: 0 }],
    };
  }
  return { left: trinomial(a, b, c).filter((t) => t.coef !== 0), right: [] };
}
export function generateFactorPractice(): SolverInstance {
  // now and then, no number on its own: x² + 4x = 0, 2x² - 6x = 0
  if (Math.random() < 0.1) {
    const g = 1 + Math.floor(Math.random() * 3);
    let k = 0;
    while (k === 0) k = Math.floor(Math.random() * 17) - 8;
    return buildQuadraticInstance({ left: [{ coef: g, pow: 2 }, { coef: g * k, pow: 1 }], right: [] });
  }
  const p = generateFactorProblem();
  return buildQuadraticInstance(practice(1, p.b, p.c));
}
export function generateSlipPractice(): SolverInstance {
  const p = generateSlipProblem();
  return buildQuadraticInstance(practice(p.a, p.b, p.c));
}
