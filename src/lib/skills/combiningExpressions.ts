// Combining like terms in an expression (no equals sign):
//   3a - 4 + 5b - 1 + 7a - b  ->  10a + 4b - 5
//
// 1. Mark each kind of like term, one kind per question, in the order they
//    first appear: the first one is marked for the student ("Let's start
//    with 3a"), and they pick which other terms go with it. Shapes: a blue
//    circle, then a red box, a green triangle, a purple diamond. With 5 or
//    more kinds, colored underlines instead (one line per power - x one
//    line, x² two - and none under constants). Every mark takes in the
//    term's sign.
// 2. Combine each kind that has more than one term, one question each.
//    The answer is written in order: highest power first, then
//    alphabetical, the number last.

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randInt, shuffle } from "./isolateVariableCore";
import type { Fraction } from "./fraction";
import { makeFraction, addFraction, fromInt } from "./fraction";
import { withCorrect, dedup } from "./compoundInequalities";

export type CoefStyle = "int" | "dec" | "frac";
export interface ExprTerm {
  coef: Fraction;
  style: CoefStyle;
  vars: [string, number][]; // letters in order, each with its power
}
export interface ExprProblem {
  terms: ExprTerm[];
}

// The tag for the i-th term of the expression: the ink color one step
// off (it looks the same), so the page can find each term to mark it.
export const termTag = (i: number) => `#1c2a${(0x45 - i).toString(16).padStart(2, "0")}`;

export const SHAPE_COLORS = ["#2e6fa3", "#d1503f", "#3d9a5c", "#7b4fb3"];
const SHAPE_NAMES = ["circle", "box", "triangle", "diamond"];
// underline colors (5 or more kinds), and their names for the questions
export const LINE_COLORS = [
  ["#2e6fa3", "blue"],
  ["#d1503f", "red"],
  ["#3d9a5c", "green"],
  ["#7b4fb3", "purple"],
  ["#e08a1e", "orange"],
  ["#1f9a9a", "teal"],
  ["#c2477f", "pink"],
  ["#8a5a2b", "brown"],
  ["#5b6b7f", "gray"],
  ["#7a8a1f", "olive"],
  ["#2b4a9a", "navy"],
  ["#b8862b", "gold"],
  ["#9a2b2b", "maroon"],
  ["#2b8a5a", "dark green"],
  ["#a05ac8", "violet"],
  ["#c86a5a", "salmon"],
] as const;

const $ = (t: string) => `$${t}$`;
const gcd = (m: number, n: number): number => {
  m = Math.abs(m);
  n = Math.abs(n);
  while (n) [m, n] = [n, m % n];
  return m || 1;
};

// ---------- terms ----------
export const kindKey = (t: ExprTerm) => t.vars.map(([v, p]) => (p === 1 ? v : `${v}^${p}`)).join("") || "1";
export const degreeOf = (t: ExprTerm) => t.vars.reduce((s, [, p]) => s + p, 0);
const varsTex = (vars: [string, number][]) => vars.map(([v, p]) => (p === 1 ? v : `${v}^{${p}}`)).join("");
const varsWords = (vars: [string, number][]) =>
  vars.map(([v, p]) => (p === 1 ? v : `${v}${p === 2 ? "²" : p === 3 ? "³" : `^${p}`}`)).join("");

function decimalText(f: Fraction): string | null {
  // a fraction whose denominator is only 2s and 5s ends as a decimal
  let d = f.den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1) return null;
  return String(Number((Math.abs(f.num) / f.den).toFixed(8)));
}
// the size of a coefficient (no sign), as tex; a 1 in front of a letter is left off
function magTex(f: Fraction, style: CoefStyle, hasVars: boolean): string {
  const n = Math.abs(f.num);
  if (hasVars && n === 1 && f.den === 1) return "";
  if (f.den === 1) return `${n}`;
  if (style === "dec") {
    const d = decimalText(f);
    if (d) return d;
  }
  return `\\dfrac{${n}}{${f.den}}`;
}
const termBody = (t: ExprTerm) => `${magTex(t.coef, t.style, t.vars.length > 0)}${varsTex(t.vars)}`;
// a term on its own: "-4", "5b", "\frac{1}{2}x"
export const termAlone = (t: ExprTerm) => `${t.coef.num < 0 ? "-" : ""}${termBody(t)}`;
// a term with its sign, for lists: "+5b", "-4"
const termSigned = (t: ExprTerm) => `${t.coef.num < 0 ? "-" : "+"}${termBody(t)}`;
// terms written one after another: "3a + 7a - a"
const sumTex = (ts: ExprTerm[]) => ts.map((t, i) => (i === 0 ? termAlone(t) : ` ${t.coef.num < 0 ? "-" : "+"} ${termBody(t)}`)).join("");

// Roughly how wide a term is, in em (to leave room for its shape).
function approxWidthEm(t: ExprTerm, withSign: boolean): number {
  const body = termBody(t)
    .replace(/\\d?frac\{(\d+)\}\{(\d+)\}/g, (_m, a, b) => "#".repeat(Math.max(String(a).length, String(b).length)))
    .replace(/\^\{\d+\}/g, "^")
    .replace(/[{}\\]/g, "");
  // (letters and digits about 0.6em; a sign with its spaces about 1.4em)
  return body.replace(/\^/g, "").length * 0.62 + (body.match(/\^/g)?.length ?? 0) * 0.45 + (withSign ? 1.4 : 0);
}

export interface Kind {
  key: string;
  vars: [string, number][];
  degree: number;
  terms: number[]; // indexes into the expression
  style: CoefStyle; // how the combined coefficient is written
}
export function kindsOf(p: ExprProblem): Kind[] {
  const out: Kind[] = [];
  p.terms.forEach((t, i) => {
    const key = kindKey(t);
    let k = out.find((m) => m.key === key);
    if (!k) {
      k = { key, vars: t.vars, degree: degreeOf(t), terms: [], style: "int" };
      out.push(k);
    }
    k.terms.push(i);
  });
  for (const k of out) {
    const styles = k.terms.map((i) => p.terms[i].style);
    k.style = styles.includes("frac") ? "frac" : styles.includes("dec") ? "dec" : "int";
  }
  return out;
}
// the answer's order: highest power first, then alphabetical, numbers last
export const answerOrder = (kinds: Kind[]) =>
  kinds
    .map((k, i) => ({ k, i }))
    .sort((m, n) => n.k.degree - m.k.degree || (m.k.degree === 0 ? 0 : m.k.key < n.k.key ? -1 : m.k.key > n.k.key ? 1 : 0))
    .map((m) => m.i);

const sumOf = (p: ExprProblem, k: Kind): Fraction => k.terms.reduce((s, i) => addFraction(s, p.terms[i].coef), fromInt(0));
const resultTerm = (p: ExprProblem, k: Kind): ExprTerm => ({ coef: sumOf(p, k), style: k.style, vars: k.vars });

// ---------- the instance ----------
export function buildExpressionInstance(p: ExprProblem): SolverInstance {
  const terms = p.terms;
  const kinds = kindsOf(p);
  const lines = kinds.length >= 5;
  const kindOfTerm = terms.map((_t, i) => kinds.findIndex((k) => k.terms.includes(i)));
  const color = (k: number) => (lines ? LINE_COLORS[k % LINE_COLORS.length][0] : SHAPE_COLORS[k]);
  const colorName = (k: number) => LINE_COLORS[k % LINE_COLORS.length][1];
  // Underlines: every kind gets its own color AND its own number of lines.
  // A kind takes as many lines as its power when that number is still free
  // (x one line, x² two); the rest take the smallest numbers left. Numbers
  // on their own (constants) get no line.
  const lineCount: number[] = kinds.map(() => 0);
  const taken = new Set<number>();
  kinds.forEach((k, ki) => {
    if (k.degree > 0 && !taken.has(k.degree)) {
      lineCount[ki] = k.degree;
      taken.add(k.degree);
    }
  });
  kinds.forEach((k, ki) => {
    if (k.degree === 0 || lineCount[ki]) return;
    let n = 1;
    while (taken.has(n)) n++;
    lineCount[ki] = n;
    taken.add(n);
  });
  const linesWords = (ki: number) => `${["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][lineCount[ki]] ?? lineCount[ki]} ${colorName(ki)} line${lineCount[ki] === 1 ? "" : "s"}`;

  // the expression: every term tagged (with its sign), and extra room
  // between terms for the shapes around them
  const extraEm = (i: number): number => {
    if (lines) return 0.1;
    const k = kindOfTerm[i];
    const w = approxWidthEm(terms[i], i > 0);
    if (k === 2 || k === 3) return w / 2 + 0.45; // triangle, diamond
    if (k === 0) return Math.max(w * 0.1 + 0.3, 0.95 - w / 2); // circle (at least round)
    return 0.25; // box
  };
  // A long expression wraps onto more lines (about 40em each), so it never
  // runs off the side; every line is its own row, marked the same way.
  // (the estimate runs about 20% short of the real width)
  const widthEm = (i: number) => (approxWidthEm(terms[i], i > 0) + 2 * extraEm(i)) * 1.2;
  const breaks: number[][] = [[]];
  let used = 0;
  terms.forEach((_t, i) => {
    const w = widthEm(i) + 0.35;
    const cur = breaks[breaks.length - 1];
    if (cur.length && used + w > Infinity) {
      breaks.push([]);
      used = 0;
    }
    breaks[breaks.length - 1].push(i);
    used += w;
  });
  const lineSlots = breaks.map((_l, j) => (j === 0 ? "__initial__" : `expr_line_${j + 1}`));
  // Every term is its own piece (sign included); the page spaces them just
  // far enough apart for their shapes, all on one line.
  const shapeName = (i: number) => {
    const k = kindOfTerm[i];
    if (lines) return kinds[k].degree > 0 ? "line" : "none";
    return SHAPE_NAMES[k];
  };
  const lineTex = (idx: number[]) =>
    "TERMRUN:" +
    JSON.stringify({
      t: idx.map((i) => {
        const t = terms[i];
        const body = i === 0 ? termAlone(t) : `{${t.coef.num < 0 ? "-" : "+"}}\\:${termBody(t)}`;
        return `\\textcolor{${termTag(i)}}{${body}}`;
      }),
      s: idx.map(shapeName),
    });
  const lineRow = (j: number, shown: number[]): GridRow => ({
    cells: [BLANK, BLANK, BLANK, BLANK, BLANK, lineTex(breaks[j]), BLANK, BLANK, BLANK],
    marks: {
      mode: lines ? "lines" : "shapes",
      kinds: kindOfTerm.map((k, i) => (breaks[j].includes(i) ? k : -1)),
      shown: shown.filter((i) => breaks[j].includes(i)),
      colors: kinds.map((_k, i) => color(i)),
      degrees: lines ? lineCount : kinds.map((k) => k.degree),
    },
  });
  const exprRow = (shown: number[]): GridRow => lineRow(0, shown);
  const exprRows = (shown: number[]) => breaks.map((_l, j) => ({ slotId: lineSlots[j], row: lineRow(j, shown) }));
  const initialRow = exprRow([]);
  const steps: SolverStep[] = [];

  // ---------- 1. mark each kind ----------
  const marked: number[] = [];
  kinds.forEach((k, ki) => {
    const first = k.terms[0];
    const others = k.terms.slice(1);
    const firstTex = $(termAlone(terms[first]));
    const list = (idx: number[]) => {
      const ts = idx.map((i) => $(termSigned(terms[i])));
      return ts.length <= 2 ? ts.join(" and ") : `${ts.slice(0, -1).join(", ")} and ${ts[ts.length - 1]}`;
    };
    const constant = k.degree === 0;
    const shape = SHAPE_NAMES[ki];
    const lead = ki === 0 ? "Let's start with" : "Next, let's";
    let prompt: string;
    if (!lines) {
      const doIt = { circle: "circle", box: "box in", triangle: "put a triangle around", diamond: "put a diamond around" }[shape]!;
      const need = { circle: "need to be circled", box: "need to be boxed in", triangle: "need a triangle", diamond: "need a diamond" }[shape]!;
      prompt = ki === 0 ? `Let's start with ${firstTex}. Are there any other terms that ${need}?` : `${lead} ${doIt} ${firstTex}. Are there any other terms that ${need}?`;
    } else if (constant) {
      prompt = `${ki === 0 ? "Let's start with" : "Next,"} the numbers on their own (constants) - they don't get a line. ${firstTex} is one. Are there any other constants?`;
    } else {
      prompt = `${ki === 0 ? "Let's start by underlining" : "Next, let's underline"} ${firstTex} with ${linesWords(ki)}. Are there any other terms that need ${linesWords(ki)}?`;
    }
    const yes = (idx: number[]) => `Yes: ${list(idx)}`;
    const no = "No, it's the only one";
    // near misses: the same letter(s) with another power, or a number when
    // the kind has letters (and the other way around)
    // (only terms that aren't marked yet)
    const rest = terms.map((_t, i) => i).filter((i) => !k.terms.includes(i) && !marked.includes(i));
    const near = rest
      .map((i) => {
        const t = terms[i];
        const sameLetters = t.vars.map(([v]) => v).join("") === k.vars.map(([v]) => v).join("");
        const sameCoef = Math.abs(t.coef.num * terms[first].coef.den) === Math.abs(terms[first].coef.num * t.coef.den);
        return { i, score: (sameLetters ? 2 : 0) + (sameCoef ? 1 : 0) + (constant === (t.vars.length === 0) ? 0 : 0) };
      })
      .sort((m, n) => n.score - m.score)
      .map((m) => m.i);
    const right = others.length ? yes(others) : no;
    const wrong: { text: string; tag: string }[] = [];
    if (others.length >= 2) wrong.push({ text: yes(others.slice(0, -1)), tag: "missed_a_like_term" });
    if (others.length) wrong.push({ text: no, tag: "missed_the_like_terms" });
    if (near.length) wrong.push({ text: yes([...others, near[0]].sort((m, n) => m - n)), tag: "unlike_term_included" });
    if (near.length > 1) wrong.push({ text: yes([near[1]]), tag: "unlike_term_chosen" });
    if (near.length && !others.length) wrong.push({ text: yes([near[0]]), tag: "unlike_term_chosen" });
    // (the last kind: everything else is already marked - an already-marked
    // term is still a fair wrong answer)
    const elsewhere = terms.map((_t, i) => i).filter((i) => !k.terms.includes(i));
    if (wrong.length < 2 && elsewhere.length) wrong.push({ text: yes([...others, elsewhere[elsewhere.length - 1]].sort((m, n) => m - n)), tag: "unlike_term_included" });
    if (wrong.length < 2 && elsewhere.length > 1) wrong.push({ text: yes([elsewhere[0]]), tag: "unlike_term_chosen" });
    const why = constant
      ? others.length
        ? `${list([first, ...others]).replace(/\$\+/g, "$")} are ${others.length === 1 ? "both" : "all"} numbers with no variable, so they're like terms.`
        : `${firstTex} is the only number with no variable.`
      : others.length
      ? `${others.length === 1 ? "Both" : "They all"} have exactly ${$(varsTex(k.vars))} - the same letter${k.vars.length > 1 ? "s" : ""} with the same power${k.vars.length > 1 ? "s" : ""} - so they're like terms.`
      : `No other term has exactly ${$(varsTex(k.vars))} (the same letter${k.vars.length > 1 ? "s" : ""} with the same power${k.vars.length > 1 ? "s" : ""}), so it's on its own.`;
    const before = [...marked];
    marked.push(...k.terms);
    steps.push({
      stepId: ki === 0 ? "mark_like_terms" : `mark_like_terms_${ki + 1}`,
      rowUpdatesOnShow: exprRows([...before, first]),
      rowUpdates: exprRows([...marked]),
      prompt,
      choices: withCorrect(right, dedup(right, wrong, 2)),
      explanationOnCorrect: why,
    });
  });

  // ---------- 2. combine each kind ----------
  const order = answerOrder(kinds);
  const results = kinds.map((k) => resultTerm(p, k));
  const live = order.filter((ki) => results[ki].coef.num !== 0);
  const combos = kinds.map((k, ki) => ({ k, ki })).filter(({ k }) => k.terms.length >= 2);
  const resultRow = (shown: (ki: number) => boolean, done = false): GridRow => {
    const tex = live.length
      ? live
          .map((ki, j) => {
            const t = results[ki];
            const body = j === 0 ? termAlone(t) : `{} ${t.coef.num < 0 ? "-" : "+"} ${termBody(t)}`;
            return `\\textcolor{${shown(ki) ? color(ki) : "transparent"}}{${body}}`;
          })
          .join("")
      : `\\textcolor{${done ? "inherit" : "transparent"}}{0}`;
    return {
      cells: [BLANK, BLANK, BLANK, BLANK, BLANK, live.length ? tex : "0", BLANK, BLANK, BLANK],
      ...(done ? { highlight: "success" as const, boxCols: [[5]] } : {}),
    };
  };
  const finalText = live.length ? live.map((ki, j) => (j === 0 ? termAlone(results[ki]) : ` ${results[ki].coef.num < 0 ? "-" : "+"} ${termBody(results[ki])}`)).join("") : "0";
  const doneKinds = new Set<number>();
  const single = (ki: number) => kinds[ki].terms.length === 1;
  const kindWords = (ki: number) => {
    if (lines) return kinds[ki].degree === 0 ? "the constants" : `the terms with ${linesWords(ki)}`;
    return ["the circled terms", "the boxed terms", "the terms in triangles", "the terms in diamonds"][ki];
  };
  combos.forEach(({ k, ki }, j) => {
    doneKinds.add(ki);
    const parts = k.terms.map((i) => terms[i]);
    const expr = sumTex(parts);
    const r = results[ki];
    const val = (f: Fraction, vars = k.vars) => (f.num === 0 ? "0" : termAlone({ coef: f, style: k.style, vars }));
    const absSum = parts.reduce((s, t) => addFraction(s, makeFraction(Math.abs(t.coef.num), t.coef.den)), fromInt(0));
    const doubled: [string, number][] = k.vars.map(([v, pw]) => [v, pw * 2]);
    const last = j === combos.length - 1;
    // an answer that doesn't come first in the answer shows its "+"
    const after = live.indexOf(ki) > 0;
    const opt = (f: Fraction, vars = k.vars) => `${after && f.num > 0 ? "+" : ""}${val(f, vars)}`;
    steps.push({
      stepId: j === 0 ? "combine_like_terms" : `combine_like_terms_${j + 1}`,
      rowUpdates: [{ slotId: "result", row: resultRow((m) => doneKinds.has(m) || single(m), last) }],
      prompt: `${j === 0 ? "Now combine each set of like terms. " : ""}Combine ${kindWords(ki)}: what is ${$(expr)}?`,
      choices: withCorrect($(opt(r.coef)), dedup($(opt(r.coef)), [
        { text: $(opt(absSum)), tag: "ignored_negative_signs" },
        ...(k.vars.length ? [{ text: $(opt(r.coef, doubled)), tag: "added_the_exponents" }] : []),
        { text: $(opt(makeFraction(-r.coef.num, r.coef.den))), tag: "sign_error" },
        { text: $(opt(addFraction(r.coef, fromInt(1)))), tag: "arithmetic_slip" },
      ], 2)),
      explanationOnCorrect:
        `${$(`${expr} = ${val(r.coef)}`)}.` +
        (k.vars.length ? ` Only the numbers in front combine - the ${$(varsTex(k.vars))} stays the same.` : "") +
        (r.coef.num === 0 ? " They cancel out." : "") +
        (last ? ` So the expression simplifies to ${$(finalText)}.` : ""),
    });
  });
  if (!combos.length) {
    // nothing combines: just write it in order
    const asTyped = sumTex(terms);
    const right = $(finalText);
    const flipped = live.length > 1 ? [...live].reverse().map((ki, j) => (j === 0 ? termAlone(results[ki]) : ` ${results[ki].coef.num < 0 ? "-" : "+"} ${termBody(results[ki])}`)).join("") : "";
    steps.push({
      stepId: "write_in_order",
      rowUpdates: [{ slotId: "result", row: resultRow(() => true, true) }],
      prompt: "None of these are like terms, so nothing combines. Which is the expression written in order (highest power first, then alphabetical, the number last)?",
      choices: withCorrect(right, dedup(right, [
        ...(asTyped !== finalText ? [{ text: $(asTyped), tag: "not_in_order" }] : []),
        ...(flipped && flipped !== finalText ? [{ text: $(flipped), tag: "reversed_order" }] : []),
        { text: $(sumTex(terms.map((t) => ({ ...t, coef: makeFraction(Math.abs(t.coef.num), t.coef.den) })))), tag: "dropped_signs" },
      ], 2)),
      explanationOnCorrect: `In order: ${$(finalText)}.`,
    });
  }
  // a kind on its own still comes down with the first combining step (done
  // above through single()); the answer line is the last line
  return {
    initialRow,
    steps,
    eqColumnIndex: 4,
    columnCount: 9,
    panelRatio: "minmax(0, 7fr) minmax(0, 3fr)",
    exampleLatex: sumTex(terms),
  };
}

// ---------- practice problems ----------
function coefFor(style: CoefStyle): Fraction {
  for (;;) {
    if (style === "int") {
      const n = randInt(-12, 12);
      if (n) return fromInt(n);
    } else if (style === "dec") {
      const n = randInt(-40, 40);
      if (n && n % 10) return makeFraction(n, 10);
    } else {
      const d = [2, 3, 4, 5, 6, 8][randInt(0, 5)];
      const n = randInt(-2 * d, 2 * d);
      if (n && n % d) return makeFraction(n, d);
    }
  }
}
const VAR_SETS: [string, number][][][] = [
  [[["x", 1]], []], // x and numbers
  [[["a", 1]], [["b", 1]], []],
  [[["x", 2]], [["x", 1]], []],
  [[["m", 1]], [["n", 1]], [["p", 1]], []],
  [[["x", 1], ["y", 1]], [["x", 1]], [["y", 1]], []],
  [[["x", 3]], [["x", 2]], [["x", 1]], []],
  [[["a", 2], ["b", 1]], [["a", 1], ["b", 1]], [["a", 1]], []],
  [[["x", 2]], [["x", 1]], [["y", 2]], [["y", 1]], [["x", 1], ["y", 1]], []],
];
export function generateExpressionProblem(): ExprProblem {
  for (;;) {
    const set = VAR_SETS[randInt(0, VAR_SETS.length - 1)];
    const r = Math.random();
    const style: CoefStyle = r < 0.75 ? "int" : r < 0.88 ? "dec" : "frac";
    const nKinds = Math.min(set.length, randInt(2, set.length));
    const kinds = shuffle(set).slice(0, nKinds);
    const terms: ExprTerm[] = [];
    for (const vars of kinds) {
      const count = randInt(1, 3);
      for (let c = 0; c < count; c++) terms.push({ coef: coefFor(vars.length ? style : style === "frac" ? "int" : style), style, vars });
    }
    const mixed = shuffle(terms);
    if (mixed.length < 3 || mixed.length > 10) continue;
    if (!kindsOf({ terms: mixed }).some((k) => k.terms.length >= 2)) continue;
    // a fraction or decimal in front of a letter, kept tidy
    if (mixed.some((t) => gcd(t.coef.num, t.coef.den) !== 1)) continue;
    return { terms: mixed };
  }
}
export function generateExpressionInstance(): SolverInstance {
  return buildExpressionInstance(generateExpressionProblem());
}

// ---------- reading a typed expression ----------
// "3a - 4 + 5b - 1 + 7a - b", "x^2 + 3x - x^2", "1.5x - \frac{1}{2}", "2xy + 3yx"
export function parseExpression(src: string): ExprProblem | string {
  let s = src
    // spacing the editor adds when you type a space ("8x\\,+\\,3y"), and
    // other spacing/formatting commands that don't change the math
    .replace(/\\(?:[,:;! ]|quad|qquad|mkern-?\d*mu|hspace\{[^}]*\}|displaystyle|mleft|mright|left|right)/g, "")
    .replace(/\\(?:text|mathrm|mathit|mathbf|operatorname)\{([^}]*)\}/g, "$1")
    .replace(/[~\s]+/g, "")
    .replace(/\\[dt]frac/g, "\\frac")
    .replace(/\\frac(\d)(\d)/g, "\\frac{$1}{$2}")
    .replace(/\\cdot|\\times|\*|×|·/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/(?<![}a-zA-Z])\{(\d+)\}(?!\{)/g, "$1") // "{3}x" from pasted math (not a fraction's parts)
    .replace(/\+-|-\+/g, "-")
    .replace(/--/g, "+");
  if (/[()[\]]/.test(s)) return "Expressions with parentheses aren't supported here yet - distribute first, then combine like terms.";
  if (!s) return "Type an expression to simplify, like 3a - 4 + 5b - 1 + 7a - b.";
  if (/^[+]/.test(s)) s = s.slice(1);
  const terms: ExprTerm[] = [];
  const re = /([+-]?)((?:\\frac\{\d+\}\{\d+\})|(?:\d+\.\d+|\.\d+|\d+)(?:\/(\d+))?)?((?:[a-zA-Z](?:\^\{?\d+\}?)?)*)/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m[0] === "" || (i > 0 && !m[1])) return "I couldn't read that expression. Write it as terms added and subtracted, like 3a - 4 + 5b - 1 + 7a - b.";
    const [, sign, coefRaw, slashDen, letters] = m;
    if (!coefRaw && !letters) return "I couldn't read that expression. Write it as terms added and subtracted, like 3a - 4 + 5b - 1 + 7a - b.";
    let coef: Fraction = fromInt(1);
    let style: CoefStyle = "int";
    if (coefRaw) {
      const fr = coefRaw.match(/^\\frac\{(\d+)\}\{(\d+)\}$/);
      if (fr) {
        if (Number(fr[2]) === 0) return "A fraction can't have 0 on the bottom.";
        coef = makeFraction(Number(fr[1]), Number(fr[2]));
        style = "frac";
      } else if (slashDen) {
        const num = coefRaw.replace(/\/\d+$/, "");
        if (Number(slashDen) === 0) return "A fraction can't have 0 on the bottom.";
        coef = makeFraction(Number(num), Number(slashDen));
        style = "frac";
      } else if (coefRaw.includes(".")) {
        const [w, f] = coefRaw.split(".");
        coef = makeFraction(Number(`${w || 0}${f}`), 10 ** f.length);
        style = "dec";
      } else coef = fromInt(Number(coefRaw));
    }
    if (sign === "-") coef = makeFraction(-coef.num, coef.den);
    const vars = new Map<string, number>();
    for (const vm of letters.matchAll(/([a-zA-Z])(?:\^\{?(\d+)\}?)?/g)) vars.set(vm[1], (vars.get(vm[1]) ?? 0) + Number(vm[2] ?? 1));
    if ([...vars.values()].some((pw) => pw > 9)) return "Powers that big aren't supported here.";
    terms.push({ coef, style, vars: [...vars.entries()].sort(([m], [n]) => (m < n ? -1 : 1)) });
    i = re.lastIndex;
  }
  if (terms.length < 2) return "There's only one term here, so there's nothing to combine.";
  if (terms.length > 16) return "That's more than 16 terms - try a shorter expression.";
  if (terms.some((t) => t.coef.num === 0)) return "One of the terms is 0 - leave it out and try again.";
  return { terms };
}
