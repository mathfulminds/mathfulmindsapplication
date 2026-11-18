// A general step planner for one-variable linear equations - any number of
// parentheses anywhere on either side, any number of like terms, the
// variable on one side or both, whole-number or decimal numbers, and
// fraction answers. It's what typed problems fall back to when no
// narrower skill takes them. It follows the same layout as Multi-Step
// Equations (With Parentheses):
//
//   1. Distribute: arrows from the number in front to each term inside
//      (one question per term), the distributed line written underneath.
//      Two sets of parentheses on the same side take two rounds, each with
//      its arrows on the line it's on.
//   2. Combine like terms on each side (x terms, then numbers), one
//      question each.
//   3. Move the variable term to the left (notes under both sides, the
//      opposites crossed out), then the number to the right, then divide
//      in place. A variable that cancels ends in "No Solution" or
//      "Infinite Solutions".

import type { SolverInstance, SolverStep, Choice, GridRow, DistributeVisual, DistributeChainGroup } from "./types";
import type { Fraction } from "./fraction";
import { makeFraction, addFraction, mulFraction, divFraction, fromInt } from "./fraction";
import type { SurfaceTerm, MixedNumber } from "../input/parseEquation";
import type { ComparisonSymbol } from "./inequalityCore";
import { flipSymbol, isInclusive, symbolDirection, symbolFromDirectionInclusive, graphChoiceText } from "./inequalityCore";

const BLANK = "\\phantom{0}";
// The sign between the two sides ("=", or an inequality sign) and what the
// problem is called in messages. Set at the start of each plan.
let REL = "=";
let KIND = "equation";
// "Solve with a calculator": the fractions stay in the problem. Numbers
// that aren't whole are then always written as fractions (never decimals),
// and a lone "x/3" keeps that form on every line it's brought down to
// (OVER holds its value, per side).
let FRACTIONS = false;
// (FRACTIONS is also on, without a calculator, for a problem whose fractions
// disappear as soon as its like terms are combined - CALCULATOR says which.)
let CALCULATOR = false;
// ...and when the problem is written with mixed numbers ("2 1/2 x"), they
// stay mixed: every number bigger than 1 that isn't whole is written as a
// mixed number (the improper fraction is never shown).
let MIXED = false;
const OVER: { left: Fraction | null; right: Fraction | null } = { left: null, right: null };
// (said on a question whose numbers aren't all whole)
const calcHint = (...nums: Fraction[]) => (CALCULATOR && nums.some((f) => f.den !== 1) ? " You can use a calculator." : "");
const isIneq = () => REL !== "=";
// "Does the inequality sign flip here?" - asked for every new line of an
// inequality. A line's sign is only written once this is answered: until
// then the line shows no sign at all (it holds the room for it).
const signOnly = (sign: string): GridRow => ({ cells: [BLANK, BLANK, sign, BLANK, BLANK] });
const noSign = () => `\\phantom{${REL}}`;
function flipCheck(stepId: string, rowUpdates: SolverStep["rowUpdates"], willFlip: boolean, why: string, explanation: string): SolverStep {
  return {
    stepId,
    rowUpdates,
    prompt: why ? `Does the inequality sign flip here? (${why})` : "Does the inequality sign flip here?",
    choices: shuffle<Choice>([
      { text: willFlip ? "Yes, the sign flips" : "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      { text: willFlip ? "No, the sign stays the same" : "Yes, the sign flips", isCorrect: false, misconceptionTag: willFlip ? "forgot_to_flip_sign" : "flipped_when_not_needed" },
    ]),
    explanationOnCorrect: explanation,
  };
}
const $ = (t: string) => `$${t}$`;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function withCorrect(correct: string, wrong: { text: string; tag: string }[], n = 2): Choice[] {
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

// ---------- numbers and terms ----------
interface Term {
  coef: Fraction;
  v: boolean; // has the variable
}
interface Group {
  m: Fraction; // the number in front
  inner: Term[];
  frac?: boolean; // the number in front was written as a fraction
}
type Item = { t: Term } | { g: Group };

const isZ = (f: Fraction) => f.num === 0;
const neg = (f: Fraction) => makeFraction(-f.num, f.den);
const absF = (f: Fraction) => makeFraction(Math.abs(f.num), f.den);
const eqF = (a: Fraction, b: Fraction) => a.num === b.num && a.den === b.den;

function terminates(f: Fraction): boolean {
  let d = f.den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}
// a number's size, as tex: 4, 2.5, or (when it doesn't end) a fraction
function magTex(f: Fraction): string {
  const n = Math.abs(f.num);
  if (f.den === 1) return `${n}`;
  if (!FRACTIONS && terminates(f)) return String(Number((n / f.den).toFixed(8)));
  if (FRACTIONS && MIXED && n > f.den) return `${Math.floor(n / f.den)}\\dfrac{${n % f.den}}{${f.den}}`;
  return `\\dfrac{${n}}{${f.den}}`;
}
const numTex = (f: Fraction) => `${f.num < 0 ? "-" : ""}${magTex(f)}`;
// a number in a sentence ("-2", "0.5")
const numText = (f: Fraction) => numTex(f);
const bodyTex = (t: Term, x: string) => (t.v ? `${eqF(absF(t.coef), fromInt(1)) ? "" : magTex(t.coef)}${x}` : magTex(t.coef));
// "3x", "-4", "x"
const leadTex = (t: Term, x: string) => `${t.coef.num < 0 ? "-" : ""}${bodyTex(t, x)}`;
// " + 3x", " - 4"
const nextTex = (t: Term, x: string) => ` ${t.coef.num < 0 ? "-" : "+"} ${bodyTex(t, x)}`;
// a term standing alone with its sign ("+ 4", "- 2x") - for the start of a
// piece of math that follows something else
const signedAlone = (t: Term, x: string) => `${t.coef.num < 0 ? "-" : "+"}\\:${bodyTex(t, x)}`;
// the variable term of a line's left or right side: "3x", or "x/3" where
// that's how the problem wrote it (see OVER)
function sideVarTex(k: Fraction, side: "left" | "right", x: string): string {
  const o = OVER[side];
  return o && k.num === o.num && k.den === o.den ? `${k.num < 0 ? "-" : ""}\\dfrac{${x}}{${k.den}}` : leadTex({ coef: k, v: true }, x);
}
// a group: "3(x + 2)", "-(x + 3)", " - 2(x - 1)"
const innerTex = (g: Group, x: string) => g.inner.map((t, i) => (i === 0 ? leadTex(t, x) : nextTex(t, x))).join("");
const mMag = (g: Group) => (eqF(absF(g.m), fromInt(1)) ? "" : g.frac ? `\\dfrac{${Math.abs(g.m.num)}}{${g.m.den}}` : magTex(g.m));
const groupLead = (g: Group, x: string) => `${g.m.num < 0 ? "-" : ""}${mMag(g)}(${innerTex(g, x)})`;
const groupNext = (g: Group, x: string) => ` ${g.m.num < 0 ? "-" : "+"} ${mMag(g)}(${innerTex(g, x)})`;
const itemLead = (it: Item, x: string) => ("t" in it ? leadTex(it.t, x) : groupLead(it.g, x));
const itemNext = (it: Item, x: string) => ("t" in it ? nextTex(it.t, x) : groupNext(it.g, x));
const sideTex = (items: Item[], x: string) => (items.length ? items.map((it, i) => (i === 0 ? itemLead(it, x) : itemNext(it, x))).join("") : "0");
// a side with some of its pieces not shown yet (they hold their room)
function sideTexShown(items: Item[], shown: (i: number) => boolean, x: string): string {
  return items
    .map((it, i) => {
      const tex = i === 0 ? itemLead(it, x) : `{}${itemNext(it, x)}`;
      return shown(i) ? tex : `\\textcolor{transparent}{${tex}}`;
    })
    .join("");
}
// a whole term as words for a prompt: "3x", "-4"
const termText = (t: Term, x: string) => $(leadTex(t, x));

// ---------- reading the parsed equation ----------
// Only what this planner handles: whole numbers and decimals, "3x" style
// terms, parentheses with exactly two terms inside and a number (or just a
// minus sign) in front. Anything else returns null and the problem keeps
// the message it had.
function readSide(side: SurfaceTerm[]): Item[] | null {
  const out: Item[] = [];
  for (const s of side) {
    if (s.kind === "const") {
      if (s.style === "fraction" || s.style === "mixed") return null;
      out.push({ t: { coef: s.value, v: false } });
    } else if (s.kind === "var") {
      if (s.form !== "multiply" || s.coefStyle === "fraction" || s.coefStyle === "mixed") return null;
      out.push({ t: { coef: s.coef, v: true } });
    } else {
      if (eqF(s.m, fromInt(1)) || s.inner.length !== 2 || s.mStyle === "mixed") return null;
      const inner: Term[] = [];
      for (const t of s.inner) {
        if (t.kind === "const") {
          if (t.style === "fraction" || t.style === "mixed") return null;
          inner.push({ coef: t.value, v: false });
        } else {
          if (t.form !== "multiply" || t.coefStyle === "fraction" || t.coefStyle === "mixed") return null;
          inner.push({ coef: t.coef, v: true });
        }
      }
      // (a fraction in front is fine when it multiplies out to whole
      // numbers: ½(4x + 6) -> 2x + 3)
      if (s.mStyle === "fraction" && inner.some((t) => mulFraction(s.m, t.coef).den !== 1)) return null;
      out.push({ g: { m: s.m, inner, frac: s.mStyle === "fraction" } });
    }
  }
  return out;
}

// ---------- fractions: clear them with the LCD ----------
// An equation with fractions in it (x/3 + 1/2 = 5, 3/4x - 1/2 = 5/2) is
// multiplied through by the least common denominator first, using the
// distributive property on the problem line itself:
//
//   1. One question for the LCD. It's then written on each side of the
//      problem: around a side with several terms, 6(x/3 + 1/2), and beside
//      a side with one term, at its outer end, 5(6). (Its room is held from
//      the start, so nothing moves.)
//   2. One question per term for its product. On a side being distributed,
//      an arrow is drawn from the LCD to that term. The line underneath
//      fills in left to right.
//
// What's left has whole numbers only, and goes on through the planner
// below like any other equation.
interface FTerm {
  coef: Fraction; // the whole signed value: -x/4 is -1/4
  v: boolean;
  // whole: "5", "2x"   over: "x/3" (the variable on top)   coef: "1/2", "2/3 x"
  shape: "whole" | "over" | "coef";
  // written as a mixed number ("2 1/2", "2 1/2 x"): rewritten as an
  // improper fraction first (shape "coef" from then on)
  mixed?: MixedNumber;
}

function readFractionSide(side: SurfaceTerm[]): FTerm[] | null {
  const out: FTerm[] = [];
  for (const s of side) {
    if (s.kind === "paren") return null;
    if (s.kind === "const") {
      if (s.style === "decimal") return null;
      if (s.style === "mixed") {
        // (2 2/4: its fraction isn't in lowest terms, so the improper
        // fraction wouldn't match what was typed)
        if (!s.mixed || gcdInt(s.mixed.num, s.mixed.den) !== 1) return null;
        out.push({ coef: s.value, v: false, shape: "coef", mixed: s.mixed });
      } else if (s.style === "fraction") {
        if (s.value.den === 1) return null; // (4/2: not a fraction once reduced)
        out.push({ coef: s.value, v: false, shape: "coef" });
      } else {
        if (s.value.den !== 1) return null;
        out.push({ coef: s.value, v: false, shape: "whole" });
      }
    } else if (s.form === "multiply" && s.coefStyle === "mixed") {
      if (!s.mixed || gcdInt(s.mixed.num, s.mixed.den) !== 1) return null;
      out.push({ coef: s.coef, v: true, shape: "coef", mixed: s.mixed });
    } else if (s.form === "multiply") {
      if (s.coefStyle !== "int" || s.coef.den !== 1) return null;
      out.push({ coef: s.coef, v: true, shape: "whole" });
    } else if (s.form === "divide") {
      if (!s.divisor || s.divisor < 2 || s.coef.den === 1) return null;
      out.push({ coef: s.coef, v: true, shape: "over" });
    } else {
      if (s.coef.den === 1) return null;
      out.push({ coef: s.coef, v: true, shape: "coef" });
    }
  }
  // (a 0 is fine as a whole side, not as a term among others)
  if (out.some((t) => isZ(t.coef)) && out.length > 1) return null;
  return out;
}

const gcdInt = (a: number, b: number): number => (b ? gcdInt(b, a % b) : Math.abs(a));
const lcmInt = (a: number, b: number) => Math.abs(a * b) / gcdInt(a, b);

// a term's size, as written: "\dfrac{x}{3}", "\dfrac{2}{3}x", "5", "2x"
function fBody(t: FTerm, x: string): string {
  if (t.shape === "whole") return bodyTex(t, x);
  if (t.shape === "over") return `\\dfrac{${x}}{${t.coef.den}}`;
  return `\\dfrac{${Math.abs(t.coef.num)}}{${t.coef.den}}${t.v ? x : ""}`;
}
// a mixed number as written: "2\dfrac{1}{2}"
const mixedTex = (m: MixedNumber) => `${m.whole}\\dfrac{${m.num}}{${m.den}}`;
// a side as first typed (mixed numbers still mixed), or - with `shown` - as
// rewritten with improper fractions, the terms not reached yet holding
// their room
function fSideWritten(ts: FTerm[], x: string, shown?: (i: number) => boolean): string {
  return ts
    .map((t, i) => {
      const body = !shown && t.mixed ? `${mixedTex(t.mixed)}${t.v ? x : ""}` : fBody(t, x);
      const tex = i === 0 ? `${t.coef.num < 0 ? "-" : ""}${body}` : `{} ${t.coef.num < 0 ? "-" : "+"} ${body}`;
      return !shown || shown(i) ? tex : `\\textcolor{transparent}{${tex}}`;
    })
    .join("");
}

// One side of a line the LCD gets written on, drawn by StepSolver (LCDWRAP).
// A side with several terms is wrapped - "6(x/3 + 1/2)" - and the LCD is
// distributed: `arrows` is how many terms, from the left, have an arrow from
// it. A side with one term isn't distributing anything, so the LCD is just
// written beside it, at the outer end of the side (away from the "="):
// "(6) x/3" on the left, "5(6)" on the right - and it gets no arrow.
// `on` shows the LCD and its parentheses (they hold their room, unseen,
// until then); `shown` says which terms are written yet.
function lcdWrapCell(ts: FTerm[], lcd: number, x: string, side: "L" | "R", on: boolean, arrows: number, shown: (i: number) => boolean = () => true): string {
  const terms = ts.map((t, i) => ({
    s: i === 0 ? (t.coef.num < 0 ? "-" : "") : t.coef.num < 0 ? "-" : "+",
    b: fBody(t, x),
    v: shown(i),
  }));
  const single = ts.length === 1;
  return `LCDWRAP:${JSON.stringify({ lcd: `${lcd}`, side, single, on, arrows: single ? 0 : arrows, tall: ts.some((t) => t.shape !== "whole"), terms })}`;
}

interface ClearedFractions {
  // the problem as the student would type it
  latex: string;
  initialRow: GridRow;
  steps: SolverStep[];
  left: Item[];
  right: Item[];
  slot: string;
}

// Mixed numbers: each one is rewritten as an improper fraction, one question
// each, on a line under the problem ("improper").
// (`lineFor` draws that line with the terms before `upTo` written - the LCD
// method draws it so the LCD can be written around it afterwards.)
function mixedNumberSteps(Lf: FTerm[], Rf: FTerm[], x: string, lineFor?: (upTo: number, sign: string) => GridRow): SolverStep[] {
  const steps: SolverStep[] = [];
  const all = [...Lf, ...Rf];
  const freeLine = (l: string, r: string, sign = REL): GridRow => ({ cells: [l, BLANK, sign, r, BLANK], spanNext: [0, 3] });
  const line = lineFor ?? ((upTo: number, sign: string) => freeLine(fSideWritten(Lf, x, (i) => i < upTo), fSideWritten(Rf, x, (i) => Lf.length + i < upTo), sign));
  const mixedAt = all.map((t, i) => (t.mixed ? i : -1)).filter((i) => i >= 0);
  mixedAt.forEach((gi, k) => {
    const m = all[gi].mixed!;
    const top = m.whole * m.den + m.num;
    const last = k === mixedAt.length - 1;
    // the line so far: everything up to this mixed number; once the last one
    // is rewritten, the rest of the line comes down too (for an inequality,
    // when the flip question below is answered)
    const upTo = last && !isIneq() ? all.length : gi + 1;
    const row = line(upTo, isIneq() ? noSign() : REL);
    const frac = (n: number) => $(`\\dfrac{${n}}{${m.den}}`);
    steps.push({
      stepId: `improper_${k}`,
      rowUpdates: [{ slotId: "improper", row }],
      prompt: `${k === 0 ? `Let's rewrite ${mixedAt.length > 1 ? "each" : "the"} mixed number as an improper fraction first. ` : ""}What is ${$(mixedTex(m))} as an improper fraction?`,
      choices: withCorrect(frac(top), [
        { text: frac(m.whole + m.num), tag: "added_whole_number_to_numerator" },
        { text: frac(m.whole * m.num + m.den), tag: "multiplied_whole_number_by_numerator" },
        { text: frac(Number(`${m.whole}${m.num}`)), tag: "wrote_whole_number_beside_numerator" },
        { text: frac(top + 1), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect:
        `Multiply the whole number by the denominator, then add the numerator: ${$(`${m.whole} \\times ${m.den} + ${m.num} = ${top}`)}. So ${$(`${mixedTex(m)} = \\dfrac{${top}}{${m.den}}`)}.` +
        (last && !isIneq() ? ` The rest of the ${KIND} gets brought down unchanged.` : ""),
    });
  });
  if (mixedAt.length && isIneq()) {
    steps.push(
      flipCheck(
        "sign_flip_check_improper",
        [{ slotId: "improper", row: line(all.length, REL) }],
        false,
        "rewriting a mixed number",
        "Rewriting a mixed number as a fraction doesn't change its value - nothing was done to both sides, so the sign stays the same. The rest of the inequality gets brought down unchanged."
      )
    );
  }

  return steps;
}

// the problem as the student would type it (for loading it as an example)
const typedLatex = (Lf: FTerm[], Rf: FTerm[], x: string) =>
  `${fSideWritten(Lf, x)} ${REL} ${fSideWritten(Rf, x)}`.replace(/\\dfrac/g, "\\frac").replace(/\{\}/g, "");

// "Solve with a calculator": nothing is cleared and nothing is rewritten -
// the planner carries on with the fractions and mixed numbers as they are.
// (Only a problem that mixes mixed numbers with improper fractions has its
// mixed numbers rewritten first, so every number is written one way.)
function keepFractions(leftIn: SurfaceTerm[], rightIn: SurfaceTerm[], x: string): ClearedFractions | null {
  const Lf = readFractionSide(leftIn);
  const Rf = readFractionSide(rightIn);
  if (!Lf || !Rf) return null;
  const every = [...Lf, ...Rf];
  if (!every.some((t) => t.shape !== "whole")) return null;
  MIXED = every.some((t) => t.mixed) && !every.some((t) => !t.mixed && t.shape !== "whole" && Math.abs(t.coef.num) > t.coef.den);
  const steps = MIXED ? [] : mixedNumberSteps(Lf, Rf, x);
  const items = (ts: FTerm[]): Item[] => ts.map((t) => ({ t: { coef: t.coef, v: t.v } }));
  // a side's only variable term, written "x/3": it keeps that form
  const over = (ts: FTerm[]) => {
    const vs = ts.filter((t) => t.v);
    return vs.length === 1 && vs[0].shape === "over" ? vs[0].coef : null;
  };
  OVER.left = over(Lf);
  OVER.right = over(Rf);
  return {
    latex: typedLatex(Lf, Rf, x),
    initialRow: { cells: [fSideWritten(Lf, x), BLANK, REL, fSideWritten(Rf, x), BLANK], spanNext: [0, 3] },
    steps,
    left: items(Lf),
    right: items(Rf),
    slot: steps.length ? "improper" : "__initial__",
  };
}

// Each side's like terms add up to whole numbers: "1/2x + 1/2x + 3x = 16".
function combiningClearsFractions(leftIn: SurfaceTerm[], rightIn: SurfaceTerm[]): boolean {
  const Lf = readFractionSide(leftIn);
  const Rf = readFractionSide(rightIn);
  if (!Lf || !Rf) return false;
  const whole = (ts: FTerm[], v: boolean) => ts.filter((t) => t.v === v).reduce((sum, t) => addFraction(sum, t.coef), fromInt(0)).den === 1;
  return [Lf, Rf].every((ts) => whole(ts, true) && whole(ts, false));
}

function clearFractions(leftIn: SurfaceTerm[], rightIn: SurfaceTerm[], x: string): ClearedFractions | null {
  const Lf = readFractionSide(leftIn);
  const Rf = readFractionSide(rightIn);
  if (!Lf || !Rf) return null;
  const all = [...Lf, ...Rf];
  const dens = Array.from(new Set(all.filter((t) => t.shape !== "whole").map((t) => t.coef.den)));
  if (!dens.length) return null;
  const lcd = dens.reduce(lcmInt, 1);
  if (lcd > 144) return null;

  const freeLine = (l: string, r: string, sign = REL): GridRow => ({ cells: [l, BLANK, sign, r, BLANK], spanNext: [0, 3] });
  const scaled = (ts: FTerm[]): Item[] => ts.map((t) => ({ t: { coef: mulFraction(fromInt(lcd), t.coef), v: t.v } }));
  const left = scaled(Lf);
  const right = scaled(Rf);
  // The line the LCD is written around: the problem itself, or - when it has
  // mixed numbers - the line where they've been rewritten as fractions.
  // `arrows`: how many terms (left side first) have their arrow yet.
  const hasMixed = all.some((t) => t.mixed);
  const lineSlot = hasMixed ? "improper" : "__initial__";
  const wrapRow = (on: boolean, arrows: number, sign = REL, upTo = all.length): GridRow =>
    freeLine(
      lcdWrapCell(Lf, lcd, x, "L", on, Math.min(arrows, Lf.length), (i) => i < upTo),
      lcdWrapCell(Rf, lcd, x, "R", on, Math.max(0, arrows - Lf.length), (i) => Lf.length + i < upTo),
      sign
    );
  // the line underneath once the first n products are found
  // When each side is already "ax + b" (nothing to combine), every product
  // is written in its own column from the start - the same columns the
  // finished line uses - so each number sits right next to its x term.
  const inColumns = (ts: FTerm[]) => ts.length <= 2 && ts.filter((t) => t.v).length <= 1 && ts.filter((t) => !t.v).length <= 1 && (ts.length < 2 || ts[0].v);
  const columns = inColumns(Lf) && inColumns(Rf);
  const sideCells = (items: Item[], shown: (i: number) => boolean): string[] => {
    const ts = items.map((it) => (it as { t: Term }).t);
    const vi = ts.findIndex((t) => t.v);
    const ci = ts.findIndex((t) => !t.v);
    const k = ci === -1 ? null : ts[ci].coef;
    return [
      vi !== -1 && shown(vi) ? leadTex(ts[vi], x) : BLANK,
      k && shown(ci) ? (vi !== -1 ? `${k.num < 0 ? "-" : "+"}\\hspace{0.5em}${magTex(k)}` : numTex(k)) : BLANK,
    ];
  };
  const clearedRow = (n: number): GridRow =>
    columns
      ? { cells: [...sideCells(left, (i) => i < n), REL, ...sideCells(right, (i) => Lf.length + i < n)] }
      : freeLine(sideTexShown(left, (i) => i < n, x), sideTexShown(right, (i) => Lf.length + i < n, x));

  const steps: SolverStep[] = [];

  steps.push(...mixedNumberSteps(Lf, Rf, x, (upTo, sign) => wrapRow(false, 0, sign, upTo)));

  // ---------- the LCD ----------
  const L = $(`${lcd}`);
  const listed = dens.map((d) => $(`${d}`));
  const list = listed.length === 1 ? listed[0] : `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}`;
  const sum = dens.reduce((s, d) => s + d, 0);
  const product = dens.reduce((s, d) => s * d, 1);
  steps.push({
    stepId: "find_lcd",
    // the LCD appears in front of each side, the side in parentheses
    rowUpdates: [{ slotId: lineSlot, row: wrapRow(true, 0) }],
    prompt:
      dens.length === 1
        ? `Let's clear the ${all.filter((t) => t.shape !== "whole").length > 1 ? "fractions" : "fraction"} first. Which number can every term be multiplied by so that the denominator ${list} cancels?`
        : `Let's clear the fractions first. What is the least common denominator (LCD) of ${list}?`,
    choices:
      dens.length === 1
        ? withCorrect(L, [
            { text: $(`\\dfrac{1}{${lcd}}`), tag: "multiplies_by_reciprocal_of_denominator" },
            { text: $(`${lcd + 1}`), tag: "arithmetic_slip" },
          ])
        : withCorrect(L, [
            { text: $(`${sum}`), tag: "added_the_denominators" },
            { text: $(`${product}`), tag: "common_denominator_but_not_least" },
            { text: $(`${Math.max(...dens)}`), tag: "used_largest_denominator" },
            { text: $(`${lcd * 2}`), tag: "common_denominator_but_not_least" },
            { text: $(`${lcd + 1}`), tag: "arithmetic_slip" },
          ]),
    explanationOnCorrect:
      dens.length === 1
        ? `Multiplying by ${L} cancels the denominator. Multiply every term on both sides of the ${KIND} by ${L}.`
        : `${L} is the smallest number that ${list} ${dens.length === 2 ? "both" : "all"} divide into evenly. Multiply every term on both sides of the ${KIND} by ${L}.`,
  });
  if (isIneq()) {
    steps.push(
      flipCheck(
        "sign_flip_check_lcd",
        [{ slotId: "cleared", row: signOnly(REL) }],
        false,
        `multiplying both sides by ${lcd}`,
        `${L} is positive, so multiplying both sides by it does not flip the inequality sign.`
      )
    );
  }

  all.forEach((t, j) => {
    const onLeft = j < Lf.length;
    const pos = onLeft ? j : j - Lf.length;
    const p: Term = { coef: mulFraction(fromInt(lcd), t.coef), v: t.v };
    // a product written after another term shows its "+" when positive
    const opt = (q: Term) => `${pos > 0 && q.coef.num > 0 ? "+" : ""}${leadTex(q, x)}`;
    const ask = `${lcd} \\times ${t.coef.num < 0 ? `\\left(-${fBody(t, x)}\\right)` : fBody(t, x)}`;
    const last = j === all.length - 1;
    let wrong: { text: string; tag: string }[];
    let why: string;
    if (t.shape === "whole") {
      wrong = [
        { text: $(opt({ coef: t.coef, v: t.v })), tag: "forgot_to_multiply_whole_number_term" },
        { text: $(opt({ ...p, coef: neg(p.coef) })), tag: "sign_error" },
        { text: $(opt({ coef: addFraction(t.coef, fromInt(t.coef.num < 0 ? -lcd : lcd)), v: t.v })), tag: "added_instead_of_multiplied" },
      ];
      why = `${$(`${ask} = ${leadTex(p, x)}`)}. Every term gets multiplied, not just the fractions.`;
    } else {
      // the top of the fraction, with the term's sign: "x", "-1", "2x"
      const top: Term = { coef: fromInt(t.coef.num), v: t.v };
      const q = lcd / t.coef.den;
      const topTex = top.coef.num < 0 ? `(${leadTex(top, x)})` : leadTex(top, x);
      wrong = [
        { text: $(opt({ coef: mulFraction(fromInt(lcd), top.coef), v: t.v })), tag: "multiplied_without_dividing_by_denominator" },
        { text: $(opt({ ...p, coef: neg(p.coef) })), tag: "sign_error" },
        { text: $(opt(top)), tag: "dropped_denominator_without_multiplying" },
        { text: $(opt({ ...p, coef: addFraction(p.coef, fromInt(p.coef.num < 0 ? -1 : 1)) })), tag: "arithmetic_slip" },
      ];
      why = `${$(`${lcd} \\div ${t.coef.den} = ${q}`)}, and ${$(`${q} \\times ${topTex} = ${leadTex(p, x)}`)}.`;
    }
    steps.push({
      stepId: `clear_${onLeft ? "left" : "right"}_${pos}`,
      rowUpdates: [
        { slotId: lineSlot, row: wrapRow(true, j + 1) },
        { slotId: "cleared", row: clearedRow(j + 1) },
      ],
      // (a side with one term is just multiplied; nothing is distributed)
      prompt: `${(onLeft ? Lf : Rf).length > 1 ? `Distribute the ${L} to each term.` : `Multiply by ${L}.`} What is ${$(ask)}?`,
      choices: withCorrect($(opt(p)), wrong),
      explanationOnCorrect: why + (last ? " The fractions are cleared." : ""),
    });
  });

  return {
    latex: typedLatex(Lf, Rf, x),
    // (with mixed numbers the problem is written plainly, and the line under
    // it - the fractions - is the one the LCD goes around)
    initialRow: hasMixed ? freeLine(fSideWritten(Lf, x), fSideWritten(Rf, x)) : wrapRow(false, 0),
    steps,
    left,
    right,
    slot: "cleared",
  };
}

// ---------- the planner ----------
export interface LinearPlan {
  instance: SolverInstance;
  hasParens: boolean;
  // the problem had fractions, cleared with the LCD first
  clearedFractions: boolean;
  inequality: boolean;
}

// Answers that don't come out whole are written as fractions (-3/2), or
// as decimals when the problem itself uses decimals.
let decimalAnswers = false;
const answerTex = (f: Fraction) =>
  f.den === 1 || FRACTIONS || (decimalAnswers && terminates(f)) ? numTex(f) : `${f.num < 0 ? "-" : ""}\\dfrac{${Math.abs(f.num)}}{${f.den}}`;

export type FractionMethod = "lcd" | "calculator";

export function planLinearEquation(
  leftIn: SurfaceTerm[],
  rightIn: SurfaceTerm[],
  x: string,
  rel: ComparisonSymbol | null = null,
  // how a problem with fractions in it is solved: cleared with the LCD
  // first, or kept as fractions (with a calculator for the arithmetic)
  method: FractionMethod = "lcd"
): LinearPlan | null {
  REL = rel ?? "=";
  KIND = rel ? "inequality" : "equation";
  FRACTIONS = false;
  CALCULATOR = false;
  MIXED = false;
  OVER.left = OVER.right = null;
  decimalAnswers = [...leftIn, ...rightIn].some(
    (s) => (s.kind === "const" && s.style === "decimal") || (s.kind === "var" && s.coefStyle === "decimal") || (s.kind === "paren" && (s.mStyle === "decimal" || s.inner.some((t) => (t.kind === "const" ? t.style : t.coefStyle) === "decimal")))
  );
  let L0 = readSide(leftIn);
  let R0 = readSide(rightIn);
  // fractions in the equation: clear them first, then carry on from the
  // whole-number line that leaves
  // Without a calculator the denominators are cleared with the LCD - unless
  // the fractions disappear just by combining like terms (1/2x + 1/2x + 3x
  // = 16 is simply 4x = 16), which is easier: then the like terms are
  // combined as they are and nothing needs clearing.
  const keep = method === "calculator" || combiningClearsFractions(leftIn, rightIn);
  const cleared = L0 && R0 ? null : keep ? keepFractions(leftIn, rightIn, x) : clearFractions(leftIn, rightIn, x);
  FRACTIONS = !!cleared && keep;
  CALCULATOR = !!cleared && method === "calculator";
  if (cleared) {
    L0 = cleared.left;
    R0 = cleared.right;
  }
  if (!L0 || !R0) return null;
  const hasParens = [...L0, ...R0].some((it) => "g" in it);
  const steps: SolverStep[] = cleared ? [...cleared.steps] : [];

  // a line written as two whole sides (each spanning both of its columns)
  const freeLine = (l: string, r: string, sign = REL): GridRow => ({ cells: [l, BLANK, sign, r, BLANK], spanNext: [0, 3] });
  // a simplified side: "ax + b" in the term and number columns
  const simple = (items: Item[]) => {
    const ts = items.filter((it): it is { t: Term } => "t" in it).map((it) => it.t);
    if (ts.length !== items.length) return null;
    const vs = ts.filter((t) => t.v);
    const cs = ts.filter((t) => !t.v);
    if (vs.length > 1 || cs.length > 1) return null;
    if (vs.length && cs.length && !ts[0].v) return null; // number first
    return { a: vs[0]?.coef ?? fromInt(0), b: cs[0]?.coef ?? fromInt(0) };
  };

  // ---------- 1. distribute ----------
  let L = L0;
  let R = R0;
  let curSlot = cleared ? cleared.slot : "__initial__";
  const initialRow = cleared ? cleared.initialRow : freeLine(sideTex(L, x), sideTex(R, x));
  // Every set of parentheses is distributed in one line: the arrows sit on
  // the problem as written, one pair per set, and the line underneath
  // fills in left to right as each product is found.
  const hasGroup = (items: Item[]) => items.some((it) => "g" in it);
  const sides: ("left" | "right")[] = (["left", "right"] as const).filter((sd) => hasGroup(sd === "left" ? L : R));
  if (sides.length) {
    const nextSlot = "distributed_1";
    const expand = (items: Item[]) => items.flatMap((it) => ("g" in it ? it.g.inner.map((t) => ({ t: { coef: mulFraction(it.g.m, t.coef), v: t.v } })) : [it]));
    const after = { left: expand(L), right: expand(R) } as Record<"left" | "right", Item[]>;
    sides.forEach((sd, si) => {
      const items = sd === "left" ? L : R;
      const gIdx = items.map((it, i) => ("g" in it ? i : -1)).filter((i) => i >= 0);
      // which positions of the new side each product lands in
      const productPos: number[] = [];
      const ownerOf: number[] = []; // for each new item: the product number it is, or -1 for a plain term
      let pos = 0;
      let pnum = 0;
      for (const it of items) {
        if ("g" in it) {
          for (let k = 0; k < it.g.inner.length; k++) {
            productPos.push(pos);
            ownerOf.push(pnum++);
            pos++;
          }
        } else {
          ownerOf.push(-1);
          pos++;
        }
      }
      const newItems = after[sd];
      const otherSide = sd === "left" ? "right" : "left";
      const otherHasTurn = sides.includes(otherSide);
      const otherDone = otherHasTurn && sides.indexOf(otherSide) < si;
      const totalProducts = pnum;
      // the line once n products on this side are found: a plain term shows
      // once everything before it has
      const lineFor = (n: number) => {
        const shown = (i: number) => {
          for (let j = 0; j <= i; j++) if (ownerOf[j] !== -1 && ownerOf[j] >= n) return false;
          return true;
        };
        const mine = sideTexShown(newItems, shown, x);
        // (an inequality's sign, and the side that's only brought down, are
        // written once the flip question after the last product is answered)
        const showOther = otherHasTurn ? otherDone : n === totalProducts && !isIneq();
        const other = showOther ? sideTex(after[otherSide], x) : BLANK;
        const sign = isIneq() ? noSign() : REL;
        return sd === "left" ? freeLine(mine, other, sign) : freeLine(other, mine, sign);
      };
      // the arrows: the first set (with whatever comes before it), then each
      // later set after the terms between them
      const sign = (g: Group) => (g.m.num < 0 ? "-" : "+");
      const unit = (g: Group) => eqF(absF(g.m), fromInt(1));
      const first = gIdx[0];
      const g0 = (items[first] as { g: Group }).g;
      const before = items.slice(0, first);
      const coefficient = first === 0 ? `${g0.m.num < 0 ? "-" : ""}${mMag(g0)}` : unit(g0) ? "-" : mMag(g0);
      const prefix = before.length ? `${sideTex(before, x)}${unit(g0) ? "\\:" : ` ${sign(g0)} {}`}` : undefined;
      const ids = (gi: number) => [`distribute_${sd}_${gi}_first`, `distribute_${sd}_${gi}_second`];
      const chain: DistributeChainGroup[] = gIdx.slice(1).map((gi, n) => {
        const g = (items[gi] as { g: Group }).g;
        const between = items.slice(gIdx[n] + 1, gi).map((it) => itemNext(it, x)).join("");
        return {
          lead: unit(g) ? `{}${between}\\:` : `{}${between} ${sign(g)} {}`,
          coefficient: unit(g) ? "-" : mMag(g),
          term1: leadTex(g.inner[0], x),
          term2: signedAlone(g.inner[1], x),
          firstTermStepId: ids(n + 1)[0],
          secondTermStepId: ids(n + 1)[1],
        };
      });
      const lastG = gIdx[gIdx.length - 1];
      const rest = items.slice(lastG + 1);
      const suffix = rest.length ? `{}${rest.map((it) => itemNext(it, x)).join("")}` : undefined;
      const visual: DistributeVisual = {
        coefficient,
        term1: leadTex(g0.inner[0], x),
        term2: signedAlone(g0.inner[1], x),
        targetSlotId: curSlot,
        termCols: sd === "left" ? [0, 1] : [3, 4],
        firstTermStepId: ids(0)[0],
        secondTermStepId: ids(0)[1],
        ...(chain.length ? { chain } : {}),
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      };
      let found = 0;
      gIdx.forEach((gi, n) => {
        const g = (items[gi] as { g: Group }).g;
        const m = g.m;
        const mAsk = eqF(m, fromInt(-1)) ? "-1" : numTex(m);
        const askTex = (t: Term) => {
          const tt = leadTex(t, x);
          return t.coef.num < 0 ? `(${tt})` : tt;
        };
        const lastGroup = n === gIdx.length - 1;
        g.inner.forEach((t, k) => {
          const p = { coef: mulFraction(m, t.coef), v: t.v };
          // a product written after another term shows its "+" when positive
          const after = productPos[found] > 0;
          found++;
          const opt = (q: Term) => `${after && q.coef.num > 0 ? "+" : ""}${leadTex(q, x)}`;
          const right = $(opt(p));
          const sideDone = lastGroup && k === g.inner.length - 1;
          steps.push({
            stepId: ids(n)[k],
            rowUpdates: [{ slotId: nextSlot, row: lineFor(found) }],
            prompt: `Distribute on the ${sd} side. What is ${$(`${mAsk} \\times ${askTex(t)}`)}?`,
            choices: withCorrect(right, [
              { text: $(opt({ ...p, coef: neg(p.coef) })), tag: "sign_error" },
              { text: $(opt(t)), tag: k === 0 ? "forgot_outside_coefficient" : "forgot_to_distribute_second_term" },
              { text: $(opt({ ...p, coef: isZ(addFraction(m, t.coef)) ? addFraction(p.coef, fromInt(p.coef.num < 0 ? -1 : 1)) : addFraction(m, t.coef) })), tag: "added_instead_of_multiplied" },
            ]),
            explanationOnCorrect:
              `${$(`${mAsk} \\times ${askTex(t)} = ${leadTex(p, x)}`)}.` +
              (sideDone ? (si === sides.length - 1 ? (isIneq() ? "" : ` The rest of the ${KIND} gets brought down unchanged.`) : ` The rest of the ${sd} side gets brought down unchanged.`) : ""),
            distributeVisual: visual,
          });
        });
      });
    });
    L = after.left;
    R = after.right;
    curSlot = nextSlot;
    if (isIneq()) {
      steps.push(
        flipCheck(
          "sign_flip_check_distribute",
          [{ slotId: nextSlot, row: freeLine(sideTex(L, x), sideTex(R, x)) }],
          false,
          "distributing",
          "Distributing only rewrites one side - nothing was done to both sides, so the sign stays the same. The rest of the inequality gets brought down unchanged."
        )
      );
    }
  }

  // ---------- 2. combine like terms on each side ----------
  const flat = (items: Item[]) => items.map((it) => (it as { t: Term }).t);
  const Lt = flat(L);
  const Rt = flat(R);
  const sumOf = (ts: Term[], v: boolean) => ts.filter((t) => t.v === v).reduce((s, t) => addFraction(s, t.coef), fromInt(0));
  const a = sumOf(Lt, true);
  const b = sumOf(Lt, false);
  const c = sumOf(Rt, true);
  const d = sumOf(Rt, false);
  const needsWork = (ts: Term[]) => ts.filter((t) => t.v).length > 1 || ts.filter((t) => !t.v).length > 1;
  const outOfOrder = (ts: Term[]) => {
    const firstV = ts.findIndex((t) => t.v);
    const firstC = ts.findIndex((t) => !t.v);
    return firstV > 0 && firstC !== -1 && firstC < firstV;
  };
  // the standard line: "ax + b = cx + d", each part in its own column
  const cellsFor = (A: Fraction, B: Fraction, C: Fraction, D: Fraction): string[] => {
    const vcell = (k: Fraction, side: "left" | "right") => (isZ(k) ? BLANK : sideVarTex(k, side, x));
    const ccell = (k: Fraction, hasVar: boolean, emptySide: boolean) =>
      isZ(k) ? (emptySide ? "0" : BLANK) : hasVar ? `${k.num < 0 ? "-" : "+"}\\hspace{0.5em}${magTex(k)}` : numTex(k);
    return [vcell(A, "left"), ccell(B, !isZ(A), isZ(A)), REL, vcell(C, "right"), ccell(D, !isZ(C), isZ(C))];
  };
  const leftCombine = needsWork(Lt) || outOfOrder(Lt);
  const rightCombine = needsWork(Rt) || outOfOrder(Rt);
  const simpleNow = !leftCombine && !rightCombine;
  if (simpleNow) {
    // Already "ax + b = cx + d": the current line is re-drawn in columns so
    // the next steps can mark single terms on it.
    const row: GridRow = { cells: cellsFor(a, b, c, d) };
    if (curSlot === "__initial__") {
      Object.assign(initialRow, row);
      delete (initialRow as { spanNext?: number[] }).spanNext;
    } else {
      // the last distributed line: its final version is the column form
      const last = [...steps].reverse().find((st) => st.rowUpdates.some((u) => u.slotId === curSlot));
      if (last) last.rowUpdates = last.rowUpdates.map((u) => (u.slotId === curSlot ? { ...u, row } : u));
    }
  } else {
    const kindsToCombine: { side: "left" | "right"; v: boolean; ts: Term[] }[] = [];
    for (const [side, ts] of [["left", Lt], ["right", Rt]] as const) {
      for (const v of [true, false]) {
        const like = ts.filter((t) => t.v === v);
        if (like.length > 1) kindsToCombine.push({ side, v, ts: like });
      }
    }
    // the combined line fills in as each side is done
    const done = new Set<string>();
    const lineNow = (last: boolean): GridRow => {
      const cells = cellsFor(a, b, c, d);
      const sideReady = (side: "left" | "right") => last || kindsToCombine.filter((k) => k.side === side).every((k) => done.has(`${k.side}${k.v}`));
      const partOk = (side: "left" | "right", v: boolean) => {
        const pending = kindsToCombine.some((k) => k.side === side && k.v === v && !done.has(`${k.side}${k.v}`));
        if (pending) return false;
        // a side with nothing to combine shows once the other side is done
        const sideHasKinds = kindsToCombine.some((k) => k.side === side);
        return sideHasKinds ? kindsToCombine.filter((k) => k.side === side).some((k) => done.has(`${k.side}${k.v}`)) || sideReady(side) : last;
      };
      const show = [partOk("left", true), partOk("left", false), true, partOk("right", true), partOk("right", false)];
      // (an inequality's sign is written once the flip question is answered)
      return { cells: cells.map((cl, i) => (i === 2 ? (isIneq() && !last ? noSign() : cl) : show[i] ? cl : BLANK)) };
    };
    if (kindsToCombine.length) {
      kindsToCombine.forEach((k, j) => {
        done.add(`${k.side}${k.v}`);
        const total = k.ts.reduce((s, t) => addFraction(s, t.coef), fromInt(0));
        const expr = k.ts.map((t, i) => (i === 0 ? leadTex(t, x) : nextTex(t, x))).join("");
        const val = (f: Fraction) => $(isZ(f) ? "0" : leadTex({ coef: f, v: k.v }, x));
        const absSum = k.ts.reduce((s, t) => addFraction(s, absF(t.coef)), fromInt(0));
        // (for an inequality the line is finished by the flip question below)
        const last = j === kindsToCombine.length - 1 && !isIneq();
        steps.push({
          stepId: `combine_${k.side}_${k.v ? "x" : "number"}`,
          rowUpdates: [{ slotId: "combined", row: lineNow(last) }],
          prompt: `Combine the like terms on the ${k.side} side. What is ${$(expr)}?${calcHint(...k.ts.map((t) => t.coef))}`,
          choices: withCorrect(val(total), [
            { text: val(absSum), tag: "ignored_negative_signs" },
            { text: val(neg(total)), tag: "sign_error" },
            { text: val(addFraction(total, fromInt(1))), tag: "arithmetic_slip" },
          ]),
          explanationOnCorrect:
            `${$(`${expr} = ${isZ(total) ? "0" : leadTex({ coef: total, v: k.v }, x)}`)}.` +
            (isZ(total) ? " They cancel out." : "") +
            (last ? ` The rest of the ${KIND} gets brought down unchanged.` : ""),
        });
      });
      if (isIneq()) {
        steps.push(
          flipCheck(
            "sign_flip_check_combine",
            [{ slotId: "combined", row: lineNow(true) }],
            false,
            "combining like terms",
            "Combining like terms only rewrites one side - nothing was done to both sides, so the sign stays the same. The rest of the inequality gets brought down unchanged."
          )
        );
      }
    } else {
      // only the order changes: x term first
      const written = (A: Fraction, B: Fraction, C: Fraction, D: Fraction) => {
        const half = (k1: Fraction, k2: Fraction) => sideTex([{ t: { coef: k1, v: true } }, { t: { coef: k2, v: false } }].filter((it) => !isZ(it.t.coef)), x);
        return $(`${half(A, B)} ${REL} ${half(C, D)}`);
      };
      // (wrong choices: one term at a time with its sign changed)
      const flipped = [
        [neg(a), b, c, d],
        [a, neg(b), c, d],
        [a, b, neg(c), d],
        [a, b, c, neg(d)],
      ] as const;
      steps.push({
        stepId: "write_x_first",
        rowUpdates: [{ slotId: "combined", row: { cells: cellsFor(a, b, c, d) } }],
        prompt: `Nothing combines, but let's write each side with the ${x} term first. What does the ${KIND} become?`,
        choices: withCorrect(
          written(a, b, c, d),
          flipped.map(([A, B, C, D]) => ({ text: written(A, B, C, D), tag: "sign_error" }))
        ),
        explanationOnCorrect: "Each term keeps its own sign when it moves.",
      });
    }
    curSlot = "combined";
  }

  // ---------- 3. solve ax + b = cx + d ----------
  const tail = solveTail(a, b, c, d, x, curSlot);
  if (!tail) return null;
  if (tail.finalIsCurrent) {
    // the last line written is already "x = 5": mark it as the answer
    const last = [...steps].reverse().find((st) => st.rowUpdates.some((u) => u.slotId === curSlot));
    if (!last) return null;
    last.rowUpdates = last.rowUpdates.map((u) => (u.slotId === curSlot ? { ...u, row: { ...(u.row as GridRow), highlight: "success" } } : u));
  }
  steps.push(...tail.steps);
  // ---------- 4. an inequality's answer: variable first, then graphed ----------
  if (isIneq() && tail.answer) {
    const value = tail.answer.value;
    let sign = tail.answer.rel as ComparisonSymbol;
    if (!tail.answer.varLeft) {
      // "4 > x" is rewritten as "x < 4" - that line is the answer
      for (const st of steps) {
        st.rowUpdates = st.rowUpdates.map((u) => {
          const r = u.row as GridRow;
          if (r.highlight !== "success") return u;
          const { highlight: _h, ...plain } = r;
          void _h;
          return { ...u, row: plain };
        });
      }
      const before = `${answerTex(value)} ${sign} ${x}`;
      sign = flipSymbol(sign);
      steps.push({
        stepId: "canonicalize_orientation",
        rowUpdates: [{ slotId: "canonicalized", row: { cells: [x, BLANK, sign, BLANK, answerTex(value)], highlight: "success" } }],
        prompt: "The goal is to get the variable on the left. Do we flip the sign when we swap sides?",
        choices: shuffle<Choice>([
          { text: "Yes, the sign flips when the sides swap", isCorrect: true, misconceptionTag: null },
          { text: "No, the sign stays the same", isCorrect: false, misconceptionTag: "forgot_symbol_flips_on_side_swap" },
        ]),
        explanationOnCorrect: `Swapping the sides flips the sign: ${$(before)} becomes ${$(`${x} ${sign} ${answerTex(value)}`)}.`,
      });
    }
    const dir = symbolDirection(sign);
    const inc = isInclusive(sign);
    const other = dir === "left" ? "right" : "left";
    // the point's label on the number line: 4, 2.5, or a stacked fraction
    const label =
      value.den === 1 || (decimalAnswers && terminates(value)) ? numTex(value) : `FRACLABEL:${value.num < 0 ? "-" : ""}${Math.abs(value.num)}/${value.den}`;
    const answer = $(`${x} ${sign} ${answerTex(value)}`);
    steps.push({
      stepId: "graph_solution",
      rowUpdates: [],
      prompt: `Which number line shows ${answer}?`,
      choices: shuffle<Choice>([
        { text: graphChoiceText(label, symbolFromDirectionInclusive(dir, inc)), isCorrect: true, misconceptionTag: null },
        { text: graphChoiceText(label, symbolFromDirectionInclusive(dir, !inc)), isCorrect: false, misconceptionTag: "misreads_inequality_boundary" },
        { text: graphChoiceText(label, symbolFromDirectionInclusive(other, inc)), isCorrect: false, misconceptionTag: "misreads_inequality_direction" },
        { text: graphChoiceText(label, symbolFromDirectionInclusive(other, !inc)), isCorrect: false, misconceptionTag: "misreads_inequality_graph" },
      ]),
      explanationOnCorrect: `${inc ? "A closed" : "An open"} circle, shaded to the ${dir}, matches ${answer}.`,
    });
  }
  return {
    hasParens,
    clearedFractions: !!cleared,
    inequality: isIneq(),
    instance: {
      initialRow,
      steps,
      eqColumnIndex: 2,
      columnCount: 5,
      panelRatio: "3fr 2fr",
      termAlign: "right",
      // with a calculator, the student picks how each number is written
      ...(CALCULATOR ? { switchableNumbers: true } : {}),
      ...(cleared ? { exampleLatex: cleared.latex } : {}),
    },
  };
}

// ---------- the last part: get x by itself ----------
interface Tail {
  steps: SolverStep[];
  // the line already showing is the answer ("x = 5"): nothing was added
  finalIsCurrent: boolean;
  // the answer (none when the variable cancels): its value, the sign it
  // ends with, and which side the variable is on
  answer: { value: Fraction; rel: string; varLeft: boolean } | null;
}
// Starts from the line in `slot`, written as "ax | b | = | cx | d".
function solveTail(a: Fraction, b: Fraction, c: Fraction, d: Fraction, x: string, slot: string): Tail | null {
  const steps: SolverStep[] = [];
  const ineq = isIneq();
  const NO_FLIP = "Adding or subtracting the same thing on both sides never flips an inequality.";
  const vTex = (k: Fraction) => leadTex({ coef: k, v: true }, x);
  const signed = (k: Fraction) => `${k.num < 0 ? "-" : "+"}\\hspace{0.5em}${magTex(k)}`;
  // a variable term's size: "3x" - or "x/3" when that's how the problem
  // wrote it (see OVER), so notes and questions about it match the line
  const isOver = (k: Fraction) => [OVER.left, OVER.right].some((o) => !!o && eqF(absF(o), absF(k)));
  const vBody = (k: Fraction) => (isOver(k) ? `\\dfrac{${x}}{${k.den}}` : bodyTex({ coef: k, v: true }, x));
  const note = (k: Fraction, v: boolean) => `${k.num < 0 ? "-" : "+"}${v ? vBody(k) : magTex(k)}`;
  // (with fractions kept in the problem, a number in a choice's sentence is
  // always written as math, so fractions and mixed numbers are drawn properly)
  const say = (k: Fraction, v: boolean) =>
    FRACTIONS || (v && isOver(k)) ? $(v ? vBody(k) : magTex(k)) : (v ? `${magTex(k) === "1" ? "" : magTex(k)}${x}` : magTex(k)).replace(/\\dfrac\{(\d+)\}\{(\d+)\}/g, "$1/$2");
  const opWords = (k: Fraction, v: boolean, flip = false) =>
    (k.num > 0) !== flip ? `Subtracting ${say(k, v)} from both sides` : `Adding ${say(k, v)} to both sides`;
  const cellsFor = (A: Fraction, B: Fraction, C: Fraction, D: Fraction, marks: number[] = []): string[] => {
    const cells = [
      isZ(A) ? BLANK : sideVarTex(A, "left", x),
      isZ(B) ? (isZ(A) ? "0" : BLANK) : isZ(A) ? numTex(B) : signed(B),
      REL,
      isZ(C) ? BLANK : sideVarTex(C, "right", x),
      isZ(D) ? (isZ(C) ? "0" : BLANK) : isZ(C) ? numTex(D) : signed(D),
    ];
    return cells.map((cl, i) => (marks.includes(i) ? `MARKEDTERM:${cl}` : cl));
  };
  const zero = fromInt(0);
  // The variable stays on the left when there's one there; otherwise on
  // the right (5 = 2x + 1 ends as 2 = x).
  const varLeft = !isZ(a) || isZ(c);
  if (isZ(a) && isZ(c)) return null; // no variable at all

  let A = a, B = b, C = c, D = d;
  let cur = slot;

  // ---------- move the variable term ----------
  if (!isZ(a) && !isZ(c)) {
    const noteRow = (marked: boolean): GridRow => ({ cells: [note(neg(c), true), BLANK, "", marked ? `MARKEDTERM:${note(neg(c), true)}` : note(neg(c), true), BLANK] });
    steps.push({
      stepId: "goal_variable_left",
      rowUpdates: [{ slotId: "cancel_var_annotation", row: noteRow(false) }],
      prompt: `Let's move the variable to the left side. What undoes ${$(note(c, true))}?`,
      choices: shuffle([
        { text: opWords(c, true), isCorrect: true, misconceptionTag: null },
        { text: opWords(c, true, true), isCorrect: false, misconceptionTag: "flipped_the_operation" },
        { text: isZ(d) ? `Dividing both sides by ${say(c, false)}` : opWords(d, false), isCorrect: false, misconceptionTag: "targets_wrong_term_first" },
      ]),
      explanationOnCorrect: "In order to get the variable term on the left side, we have to undo it on the right side.",
    });
    const same = eqF(a, c);
    if (ineq) steps.push(flipCheck("sign_flip_check_variable", [{ slotId: same ? "reduced_equation" : "after_var_elim", row: signOnly(REL) }], false, "", NO_FLIP));
    steps.push({
      stepId: "cancel_variable_term",
      rowUpdates: [
        { slotId: cur, row: { cells: cellsFor(A, B, C, D, same ? [0, 3] : [3]) } },
        { slotId: "cancel_var_annotation", row: same ? { cells: [`MARKEDTERM:${note(neg(c), true)}`, BLANK, "", `MARKEDTERM:${note(neg(c), true)}`, BLANK] } : noteRow(true) },
        ...(same ? [{ slotId: "reduced_equation", row: { cells: cellsFor(zero, B, zero, D) } }] : []),
      ],
      prompt: `What is ${$(`${c.num < 0 ? "-" : ""}${vBody(c)} ${c.num < 0 ? "+" : "-"} ${vBody(c)}`)}?`,
      choices: withCorrect("0", [
        { text: $(vTex(makeFraction(2 * Math.abs(c.num), c.den))), tag: "flipped_the_operation" },
        { text: $(vTex(absF(c))), tag: "forgot_to_apply_operation" },
        { text: $(vTex(neg(absF(c)))), tag: "sign_error" },
      ]),
      explanationOnCorrect: same
        ? `The ${x} terms are opposites resulting in 0 on both sides, so the variable disappears completely.`
        : `The ${x} terms are opposites resulting in 0.`,
    });
    if (same && ineq) {
      // the variable is gone: what's left is a statement about two numbers
      const diff = addFraction(B, neg(D)).num; // B - D
      const isTrue = REL === "<" ? diff < 0 : REL === ">" ? diff > 0 : REL === "\\leq" ? diff <= 0 : diff >= 0;
      const stmt = $(`${numTex(B)} ${REL} ${numTex(D)}`);
      steps.push({
        stepId: "interpret_result",
        rowUpdates: [{ slotId: "final", row: { cells: [], caption: isTrue ? "All Real Numbers" : "No Solution", highlight: "success" } }],
        prompt: `The inequality simplifies to ${stmt}. What does this tell us about the solution?`,
        choices: shuffle([
          { text: isTrue ? "All real numbers" : "No solution", isCorrect: true, misconceptionTag: null },
          { text: isTrue ? "No solution" : "All real numbers", isCorrect: false, misconceptionTag: "flips_identity_and_contradiction" },
          { text: $(`${x} ${REL} ${numTex(D)}`), isCorrect: false, misconceptionTag: "treats_statement_as_solution" },
        ]),
        explanationOnCorrect: isTrue
          ? `Since ${stmt} is always true, every value of ${x} makes the original inequality true.`
          : `Since ${stmt} is never true, no value of ${x} makes the original inequality true.`,
      });
      return { steps, finalIsCurrent: false, answer: null };
    }
    if (same) {
      const identity = eqF(B, D);
      const bT = numTex(B), dT = numTex(D);
      steps.push({
        stepId: "interpret_result",
        rowUpdates: [{ slotId: "final", row: { cells: [], caption: identity ? "Infinite Solutions" : "No Solution", highlight: "success" } }],
        prompt: `The equation simplifies to ${$(`${bT} = ${dT}`)}. What does this tell us about the solution?`,
        choices: shuffle([
          { text: identity ? "Infinite solutions" : "No solution", isCorrect: true, misconceptionTag: null },
          { text: identity ? "No solution" : "Infinite solutions", isCorrect: false, misconceptionTag: "flips_identity_and_contradiction" },
          { text: "One solution", isCorrect: false, misconceptionTag: "assumes_unique_solution_exists" },
        ]),
        explanationOnCorrect: identity
          ? `Since ${$(`${bT} = ${dT}`)} is always true, every value of ${x} makes the original equation true.`
          : `Since ${$(`${bT} = ${dT}`)} is never true, no value of ${x} makes the original equation true.`,
      });
      return { steps, finalIsCurrent: false, answer: null };
    }
    const newA = addFraction(a, neg(c));
    steps.push({
      stepId: "combine_variable_term",
      rowUpdates: [{ slotId: "after_var_elim", row: { cells: cellsFor(newA, B, zero, D) } }],
      prompt: `What is ${$(`${sideVarTex(a, "left", x)} ${c.num < 0 ? "+" : "-"} ${vBody(c)}`)}?${calcHint(a, c)}`,
      choices: withCorrect($(isZ(newA) ? "0" : vTex(newA)), [
        { text: $(vTex(addFraction(a, c))), tag: "flipped_the_operation" },
        { text: $(vTex(neg(newA))), tag: "sign_error" },
        { text: $(vTex(addFraction(newA, fromInt(1)))), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `The terms combine to ${$(vTex(newA))}. The rest of the ${KIND} gets brought down unchanged.`,
    });
    A = newA;
    C = zero;
    cur = "after_var_elim";
  } else if (isZ(a) && !isZ(c)) {
    // (variable on the right only: it stays there)
  }

  // ---------- move the number ----------
  // (from the variable's side to the other side)
  const K = varLeft ? A : C; // the variable's coefficient
  const own = varLeft ? B : D; // the number beside it
  const other = varLeft ? D : B;
  let value = other;
  if (!isZ(own)) {
    const n = note(neg(own), false);
    const ownCol = varLeft ? 1 : 4;
    const otherCol = varLeft ? 4 : 1;
    const noteCells = (marked: boolean) => {
      const cells = [BLANK, BLANK, "", BLANK, BLANK];
      cells[ownCol] = marked ? `MARKEDTERM:${n}` : n;
      cells[otherCol] = n;
      return cells;
    };
    const sideName = varLeft ? "right" : "left";
    steps.push({
      stepId: "goal_constant",
      rowUpdates: [{ slotId: "cancel_const_annotation", row: { cells: noteCells(false) } }],
      prompt: `Let's move the constant to the ${sideName} side. What undoes ${$(note(own, false))}?`,
      choices: shuffle([
        { text: opWords(own, false), isCorrect: true, misconceptionTag: null },
        { text: `${own.num > 0 ? "Dividing" : "Multiplying"} both sides by ${say(own, false)}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
        { text: opWords(own, false, true), isCorrect: false, misconceptionTag: "flipped_the_operation" },
      ]),
      explanationOnCorrect: `In order to get the constant on the ${sideName} side, we have to undo it on the ${varLeft ? "left" : "right"} side.`,
    });
    if (ineq) steps.push(flipCheck("sign_flip_check_constant", [{ slotId: "after_const_elim", row: signOnly(REL) }], false, "", NO_FLIP));
    const marks = [ownCol];
    steps.push({
      stepId: "cancel_constant",
      rowUpdates: [
        { slotId: cur, row: { cells: cellsFor(A, B, C, D, marks) } },
        { slotId: "cancel_const_annotation", row: { cells: noteCells(true) } },
      ],
      prompt: `What is ${$(`${numTex(own)} ${own.num < 0 ? "+" : "-"} ${magTex(own)}`)}?`,
      choices: withCorrect("0", [
        { text: $(numTex(makeFraction(2 * Math.abs(own.num), own.den))), tag: "flipped_the_operation" },
        { text: $(magTex(own)), tag: "forgot_to_apply_operation" },
        { text: $(numTex(neg(absF(own)))), tag: "sign_error" },
      ]),
      explanationOnCorrect: "The constants are opposites resulting in 0.",
    });
    value = addFraction(other, neg(own));
    const needsDivide = !eqF(K, fromInt(1));
    const row: GridRow = {
      cells: varLeft ? cellsFor(K, zero, zero, value) : cellsFor(zero, value, K, zero),
      ...(needsDivide ? {} : { highlight: "success" as const }),
    };
    // (a lone value on the other side sits next to the "=")
    if (varLeft) row.cells = [sideVarTex(K, "left", x), BLANK, REL, BLANK, numTex(value)];
    else row.cells = [BLANK, numTex(value), REL, sideVarTex(K, "right", x), BLANK];
    steps.push({
      stepId: "combine_constant",
      rowUpdates: [{ slotId: "after_const_elim", row }],
      prompt: `What is ${$(`${numTex(other)} ${own.num < 0 ? "+" : "-"} ${magTex(own)}`)}?${calcHint(other, own)}`,
      choices: withCorrect($(numTex(value)), [
        { text: $(numTex(addFraction(other, own))), tag: "flipped_the_operation" },
        { text: $(numTex(neg(value))), tag: "sign_error" },
        { text: $(numTex(addFraction(value, fromInt(1)))), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: needsDivide
        ? `The terms combine to ${$(numTex(value))}. The rest of the ${KIND} gets brought down unchanged.`
        : `The terms combine to ${$(numTex(value))}. Since the coefficient of ${x} is already 1, this is the final answer.`,
    });
    cur = "after_const_elim";
    if (!needsDivide) return { steps, finalIsCurrent: false, answer: { value, rel: REL, varLeft } };
  } else if (eqF(K, fromInt(1))) {
    // already x = value: that line is the answer
    const answer = { value, rel: REL, varLeft };
    for (let i = steps.length - 1; i >= 0; i--) {
      const u = steps[i].rowUpdates.find((r) => r.slotId === cur);
      if (u) {
        u.row = { ...(u.row as GridRow), highlight: "success" };
        return { steps, finalIsCurrent: false, answer };
      }
    }
    return { steps, finalIsCurrent: true, answer };
  } else {
    // nothing to move: the current line is already "kx = value"
  }

  // ---------- divide ----------
  const answer = divFraction(value, K);
  // Dividing a whole number by a whole number is drawn with the division
  // bar, in place (the steps further down). When a fraction is involved -
  // the number being divided, or the number dividing it - it's written with
  // the division sign instead, so a fraction never sits on top of a fraction.
  if (FRACTIONS && !(K.den === 1 && value.den === 1)) {
    // With fractions in the line, the division is written as a note under
    // both sides (like the adding and subtracting above it) and worked out
    // on a calculator - nothing is stacked in place. A lone "x/3" is undone
    // by multiplying by 3 instead, written on the line itself at the outer
    // end of each side: "(3) x/3 = 9/2 (3)" ("-x/3" is multiplied by -3, as a
    // note). Either way the student still confirms what cancels: the number
    // divided by itself is 1, and both copies of it are crossed out.
    const side = varLeft ? "left" : "right";
    const o = OVER[side];
    const times = !!o && eqF(K, o);
    const by = times ? fromInt(K.num < 0 ? -K.den : K.den) : K;
    const byTex = by.num < 0 ? `\\left(${numTex(by)}\\right)` : numTex(by);
    const note = `${times ? "\\times" : "\\div"}\\,${byTex}`;
    const expr = `${numTex(value)} ${times ? "\\times" : "\\div"} ${byTex}`;
    const byWords = $(numTex(by));
    // "(3)" written on the line (a positive number only: the term keeps its
    // place, the (3) is added at the outer end of each side)
    const inLine = times && by.num > 0;
    const timesCells = (crossedOut: boolean): string[] => {
      const term = crossedOut
        ? `MARKEDTIMES:${varLeft ? "L" : "R"}\u0006${by.num}\u0006${x}\u0006${K.den}`
        : varLeft
        ? `(${by.num})\\dfrac{${x}}{${K.den}}`
        : `\\dfrac{${x}}{${K.den}}(${by.num})`;
      const val = varLeft ? `${numTex(value)}(${by.num})` : `(${by.num})${value.num < 0 ? `\\left(${numTex(value)}\\right)` : numTex(value)}`;
      return varLeft ? [term, BLANK, REL, BLANK, val] : [BLANK, val, REL, term, BLANK];
    };
    const flips = ineq && by.num < 0;
    const lastRel = flips ? flipSymbol(REL as ComparisonSymbol) : REL;
    steps.push({
      stepId: "eliminate_coefficient",
      rowUpdates: inLine
        ? [{ slotId: cur, row: { cells: timesCells(false) } }]
        : [{ slotId: "coefficient_annotation", row: { cells: varLeft ? [note, BLANK, "", BLANK, note] : [BLANK, note, "", note, BLANK] } }],
      prompt: times ? `What undoes dividing ${x} by ${$(numTex(by))}?` : `What undoes multiplying ${x} by ${$(numTex(K))}?`,
      choices: shuffle([
        { text: `${times ? "Multiplying" : "Dividing"} both sides by ${byWords}`, isCorrect: true, misconceptionTag: null },
        { text: `${times ? "Dividing" : "Multiplying"} both sides by ${byWords}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
        { text: `${by.num > 0 ? "Subtracting" : "Adding"} ${say(by, false)} ${by.num > 0 ? "from" : "to"} both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      ]),
      explanationOnCorrect: times
        ? `Undo division by multiplying both sides by ${$(numTex(by))}.`
        : `The coefficient ${$(numTex(K))} cancels when you divide both sides by ${$(numTex(K))}.`,
    });
    if (ineq) {
      steps.push(
        flipCheck(
          "sign_flip_check_coefficient",
          [{ slotId: "coefficient_confirmed", row: signOnly(lastRel) }],
          flips,
          `${times ? "multiplying" : "dividing"} both sides by ${numTex(by)}`,
          flips
            ? `Multiplying or dividing both sides by a negative number (${$(numTex(by))}) flips the inequality sign.`
            : `${$(numTex(by))} is positive, so ${times ? "multiplying" : "dividing"} both sides by it does not flip the inequality sign.`
        )
      );
    }
    // the line with its number crossed out: the number in front of x, or
    // (for "x/3") the number under it
    const crossed = times
      ? `MARKEDDEN:${K.num < 0 ? "-" : ""}\u0006${x}\u0006${K.den}`
      : `MARKEDCOEF:${K.num < 0 ? "-" : ""}${eqF(absF(K), fromInt(1)) ? "" : magTex(K)}\u0006${x}`;
    const crossedNote = `MARKEDTERM:${note}`;
    steps.push({
      stepId: "confirm_coefficient_one",
      rowUpdates: [
        ...(inLine
          ? [{ slotId: cur, row: { cells: timesCells(true) } }]
          : [
              { slotId: cur, row: { cells: varLeft ? [crossed, BLANK, REL, BLANK, numTex(value)] : [BLANK, numTex(value), REL, crossed, BLANK] } },
              { slotId: "coefficient_annotation", row: { cells: varLeft ? [crossedNote, BLANK, "", BLANK, note] : [BLANK, note, "", crossedNote, BLANK] } },
            ]),
        { slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, lastRel, BLANK, BLANK] : [BLANK, BLANK, lastRel, x, BLANK] } },
      ],
      prompt: `What is ${$(`${numTex(by)} \\div ${byTex}`)}?`,
      choices: withCorrect("1", [
        { text: "0", tag: "confuses_division_with_subtraction_pattern" },
        { text: $(numTex(by)), tag: "forgot_to_apply_operation" },
        { text: $(numTex(mulFraction(by, by))), tag: "multiplied_instead" },
        { text: "-1", tag: "sign_error" },
      ]),
      explanationOnCorrect: times
        ? `${$(numTex(by))} divided by itself is 1, so the variable is isolated.`
        : `The coefficient ${$(numTex(K))} divided by itself is 1, so the variable is isolated.`,
    });
    const ans = answerTex(answer);
    const pick = (v: Fraction) => (ineq ? $(answerTex(v)) : $(varLeft ? `${x} = ${answerTex(v)}` : `${answerTex(v)} = ${x}`));
    steps.push({
      stepId: "compute_value",
      rowUpdates: [{ slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, lastRel, BLANK, ans] : [BLANK, ans, lastRel, x, BLANK], highlight: "success" } }],
      prompt: `${$(expr)} = ?${CALCULATOR ? " You can use a calculator." : ""} ${ineq ? "What number completes the inequality?" : `What is the value of ${x}?`}`,
      choices: withCorrect(pick(answer), [
        { text: pick(times ? divFraction(value, by) : mulFraction(value, by)), tag: times ? "divided_instead" : "multiplied_instead" },
        { text: pick(neg(answer)), tag: "sign_error" },
        { text: pick(value), tag: "forgot_final_operation" },
        { text: pick(addFraction(answer, fromInt(1))), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `${$(`${expr} = ${ans}`)}.`,
    });
    return { steps, finalIsCurrent: false, answer: { value: answer, rel: lastRel, varLeft } };
  }
  const divRow = (marked: boolean): GridRow => {
    const top = marked ? `MARKEDFRACTION:${numTex(K)}\u0006${x}\u0005${numTex(K)}` : `\\dfrac{${eqF(K, fromInt(-1)) ? `-1${x}` : vTex(K)}}{${numTex(K)}}`;
    const val = `\\dfrac{${numTex(value)}}{${numTex(K)}}`;
    return { cells: varLeft ? [top, BLANK, REL, BLANK, val] : [BLANK, val, REL, top, BLANK] };
  };
  // dividing by a negative number flips an inequality's sign
  const willFlip = ineq && K.num < 0;
  const endRel = willFlip ? flipSymbol(REL as ComparisonSymbol) : REL;
  steps.push({
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: cur, row: divRow(false) }],
    prompt: `What undoes multiplying ${x} by ${$(numTex(K))}?`,
    choices: shuffle([
      { text: `Dividing both sides by ${say(K, false).replace(/^/, K.num < 0 ? "-" : "")}`, isCorrect: true, misconceptionTag: null },
      { text: `Multiplying both sides by ${say(K, false).replace(/^/, K.num < 0 ? "-" : "")}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: `${K.num > 0 ? "Subtracting" : "Adding"} ${say(K, false)} ${K.num > 0 ? "from" : "to"} both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `The coefficient ${$(numTex(K))} cancels when you divide both sides by ${$(numTex(K))}.`,
  });
  if (ineq) {
    steps.push(
      flipCheck(
        "sign_flip_check_coefficient",
        [{ slotId: "coefficient_confirmed", row: signOnly(endRel) }],
        willFlip,
        `dividing both sides by ${numTex(K)}`,
        willFlip
          ? `Multiplying or dividing both sides by a negative number (${$(numTex(K))}) flips the inequality sign.`
          : `${$(numTex(K))} is positive, so dividing both sides by it does not flip the inequality sign.`
      )
    );
  }
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: cur, row: divRow(true) },
      { slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, endRel, BLANK, BLANK] : [BLANK, BLANK, endRel, x, BLANK] } },
    ],
    prompt: `What is ${$(`${numTex(K)} \\div ${K.num < 0 ? `(${numTex(K)})` : numTex(K)}`)}?`,
    choices: withCorrect("1", [
      { text: $(numTex(K)), tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: "-1", tag: "sign_error" },
    ]),
    explanationOnCorrect: `The coefficient ${$(numTex(K))} divided by itself is 1, so the variable is isolated.`,
  });
  const ansTex = answerTex(answer);
  // (an inequality asks just for the number: its sign is already on the line)
  const eqText = (v: Fraction) => (ineq ? $(answerTex(v)) : $(varLeft ? `${x} = ${answerTex(v)}` : `${answerTex(v)} = ${x}`));
  const sameSign = value.num >= 0 === K.num >= 0;
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, endRel, BLANK, ansTex] : [BLANK, ansTex, endRel, x, BLANK], highlight: "success" } }],
    prompt: `${$(`${numTex(value)} \\div ${K.num < 0 ? `(${numTex(K)})` : numTex(K)}`)} = ? ${ineq ? "What number completes the inequality?" : `What is the value of ${x}?`}`,
    choices: withCorrect(eqText(answer), [
      { text: eqText(neg(answer)), tag: "sign_error" },
      { text: eqText(mulFraction(value, K)), tag: "multiplied_instead" },
      { text: eqText(divFraction(K, isZ(value) ? fromInt(1) : value)), tag: "divided_the_wrong_way" },
      { text: eqText(addFraction(answer, fromInt(1))), tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect:
      `${$(`${numTex(value)} \\div ${K.num < 0 ? `(${numTex(K)})` : numTex(K)} = ${ansTex}`)}.` +
      (answer.den !== 1 && !terminates(answer) ? " It doesn't divide evenly, so the answer stays a fraction." : "") +
      (isZ(value) ? "" : sameSign ? " Same signs give a positive result." : " Different signs give a negative result."),
  });
  return { steps, finalIsCurrent: false, answer: { value: answer, rel: endRel, varLeft } };
}

// ---------- practice problems: clearing fractions ----------
// Random equations with fractions in them, all with whole-number answers:
//   x/3 + 1/2 = 7/2      3/4 x - 1/2 = 5/2
//   x/2 + x/3 = 10       2/3 x + 1 = x/6 - 4
//   2 1/2 x + 3 = 8      (a mixed number, rewritten as a fraction first)
export interface FractionProblem {
  left: SurfaceTerm[];
  right: SurfaceTerm[];
}
// The same problem, worked either way (the practice page lets the student
// pick the method).
export function buildFractionInstance(problem: FractionProblem, method: FractionMethod): SolverInstance {
  return planLinearEquation(problem.left, problem.right, "x", null, method)!.instance;
}
export function generateClearFractionsInstance(): SolverInstance {
  return buildFractionInstance(generateFractionProblem(), "lcd");
}
export function generateFractionProblem(): FractionProblem {
  const x = "x";
  const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const sign = () => (Math.random() < 0.5 ? -1 : 1);
  const num = (f: Fraction): SurfaceTerm => ({ kind: "const", value: f, style: f.den === 1 ? "int" : "fraction" });
  const over = (d: number): SurfaceTerm => ({ kind: "var", name: x, coef: makeFraction(1, d), form: "divide", coefStyle: "int", divisor: d, negatedNumerator: false });
  const fracX = (n: number, d: number): SurfaceTerm => ({ kind: "var", name: x, coef: makeFraction(n, d), form: "fraction", coefStyle: "fraction" });
  // a proper fraction in lowest terms with this denominator
  const proper = (d: number) => {
    let n = rand(1, d - 1);
    while (gcdInt(n, d) !== 1) n = rand(1, d - 1);
    return n;
  };
  for (let tries = 0; tries < 200; tries++) {
    const a = rand(2, 6);
    let b = rand(2, 6);
    while (b === a) b = rand(2, 6);
    const k = rand(1, 4) * sign();
    let left: SurfaceTerm[];
    let right: SurfaceTerm[];
    const kind = rand(0, 4);
    if (kind === 4) {
      // (w n/a)x + p = q
      const w = rand(1, 3);
      const n = proper(a);
      const top = w * a + n;
      const sol = a * (k > 0 ? 1 : -1) * rand(1, 2);
      const p = rand(1, 9) * sign();
      const q = (top * sol) / a + p;
      if (q === 0) continue;
      left = [{ kind: "var", name: x, coef: makeFraction(top, a), form: "multiply", coefStyle: "mixed", mixed: { whole: w, num: n, den: a } }, num(fromInt(p))];
      right = [num(fromInt(q))];
    } else if (kind === 0) {
      // x/a + p/b = r
      const p = makeFraction(proper(b) * sign(), b);
      left = [over(a), num(p)];
      right = [num(addFraction(fromInt(k), p))];
    } else if (kind === 1) {
      // (n/a)x + p/b = r
      if (a === 2) continue;
      const n = proper(a);
      if (n === 1) continue;
      const p = makeFraction(proper(b) * sign(), b);
      left = [fracX(n, a), num(p)];
      right = [num(addFraction(fromInt(n * k), p))];
    } else if (kind === 2) {
      // x/a + x/b = c
      const sol = lcmInt(a, b) * (k > 0 ? 1 : -1) * rand(1, 2);
      left = [over(a), over(b)];
      right = [num(fromInt(sol / a + sol / b))];
    } else {
      // (n/a)x + p = x/b + q
      if (a === 2) continue;
      const n = proper(a);
      const sol = lcmInt(a, b) * (k > 0 ? 1 : -1);
      const p = rand(1, 9) * sign();
      const q = (n * sol) / a + p - sol / b;
      if (q === 0 || n * b === a) continue;
      left = [n === 1 ? over(a) : fracX(n, a), num(fromInt(p))];
      right = [over(b), num(fromInt(q))];
    }
    if ([...left, ...right].some((t) => t.kind === "const" && isZ(t.value))) continue;
    // (both methods have to work for it)
    if (planLinearEquation(left, right, x)?.clearedFractions && planLinearEquation(left, right, x, null, "calculator")) return { left, right };
  }
  // (never reached in practice) x/3 + 1/2 = 7/2
  return { left: [over(3), num(makeFraction(1, 2))], right: [num(makeFraction(7, 2))] };
}

// ---------- practice problems: multi-step inequalities ----------
// Random inequalities that take distributing or combining like terms
// before the usual steps, all with whole-number answers:
//   3(x + 2) > x + 12        4x - 5 + 2x <= 3x + 7
//   2(x - 1) + 9 < 5(x + 2)  7 - 2(x + 3) >= 9
export function generateMultiStepInequalityInstance(): SolverInstance {
  const x = "x";
  const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const nz = (lo: number, hi: number) => {
    let n = rand(lo, hi);
    while (n === 0) n = rand(lo, hi);
    return n;
  };
  const num = (n: number): SurfaceTerm => ({ kind: "const", value: fromInt(n), style: "int" });
  const vx = (n: number): SurfaceTerm => ({ kind: "var", name: x, coef: fromInt(n), form: "multiply", coefStyle: "int" });
  const group = (m: number, p: number): SurfaceTerm => ({
    kind: "paren",
    m: fromInt(m),
    mStyle: "int",
    inner: [
      { kind: "var", name: x, coef: fromInt(1), form: "multiply", coefStyle: "int" },
      { kind: "const", value: fromInt(p), style: "int" },
    ],
  });
  const signs: ComparisonSymbol[] = ["<", ">", "\\leq", "\\geq"];
  // a number in front of parentheses: 2 to 5, or -2 to -5
  const front = () => rand(2, 5) * (Math.random() < 0.35 ? -1 : 1);
  for (let tries = 0; tries < 300; tries++) {
    const B = nz(-9, 9); // the answer's number
    const rel = signs[rand(0, 3)];
    let left: SurfaceTerm[];
    let right: SurfaceTerm[];
    const kind = rand(0, 3);
    if (kind === 0) {
      // m(x + p) ? nx + q
      const m = front();
      const p = nz(-6, 6);
      const n = nz(-6, 6);
      const q = m * (B + p) - n * B;
      if (n === m || q === 0 || Math.abs(q) > 60) continue;
      left = [group(m, p)];
      right = [vx(n), num(q)];
    } else if (kind === 1) {
      // ax + b + cx ? dx + e
      const a = nz(-6, 6);
      const c = nz(-6, 6);
      const d = nz(-6, 6);
      const b = nz(-12, 12);
      const e = (a + c - d) * B + b;
      if (a + c === 0 || a + c === d || e === 0 || Math.abs(e) > 60) continue;
      left = [vx(a), num(b), vx(c)];
      right = [vx(d), num(e)];
    } else if (kind === 2) {
      // m(x + p) + k ? n(x + q)
      const m = front();
      const n = front();
      const p = nz(-6, 6);
      const q = nz(-6, 6);
      const k = n * (B + q) - m * (B + p);
      if (m === n || k === 0 || Math.abs(k) > 40 || m * p + k === 0) continue;
      left = [group(m, p), num(k)];
      right = [group(n, q)];
    } else {
      // k - m(x + p) ? q
      const m = rand(2, 5);
      const p = nz(-6, 6);
      const k = nz(-12, 12);
      const q = k - m * (B + p);
      if (q === 0 || Math.abs(q) > 60 || k - m * p === 0) continue;
      left = [num(k), group(-m, p)];
      right = [num(q)];
    }
    const plan = planLinearEquation(left, right, x, rel);
    if (plan) return plan.instance;
  }
  // (never reached in practice) 3(x + 2) > x + 12
  return planLinearEquation([group(3, 2)], [vx(1), num(12)], x, ">")!.instance;
}
