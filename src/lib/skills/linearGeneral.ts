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
import type { SurfaceTerm } from "../input/parseEquation";

const BLANK = "\\phantom{0}";
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
  if (terminates(f)) return String(Number((n / f.den).toFixed(8)));
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
      if (s.style === "fraction") return null;
      out.push({ t: { coef: s.value, v: false } });
    } else if (s.kind === "var") {
      if (s.form !== "multiply" || s.coefStyle === "fraction") return null;
      out.push({ t: { coef: s.coef, v: true } });
    } else {
      if (eqF(s.m, fromInt(1)) || s.inner.length !== 2) return null;
      const inner: Term[] = [];
      for (const t of s.inner) {
        if (t.kind === "const") {
          if (t.style === "fraction") return null;
          inner.push({ coef: t.value, v: false });
        } else {
          if (t.form !== "multiply" || t.coefStyle === "fraction") return null;
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

// ---------- the planner ----------
export interface LinearPlan {
  instance: SolverInstance;
  hasParens: boolean;
}

// Answers that don't come out whole are written as fractions (-3/2), or
// as decimals when the problem itself uses decimals.
let decimalAnswers = false;
const answerTex = (f: Fraction) =>
  f.den === 1 || (decimalAnswers && terminates(f)) ? numTex(f) : `${f.num < 0 ? "-" : ""}\\dfrac{${Math.abs(f.num)}}{${f.den}}`;

export function planLinearEquation(leftIn: SurfaceTerm[], rightIn: SurfaceTerm[], x: string): LinearPlan | null {
  decimalAnswers = [...leftIn, ...rightIn].some(
    (s) => (s.kind === "const" && s.style === "decimal") || (s.kind === "var" && s.coefStyle === "decimal") || (s.kind === "paren" && (s.mStyle === "decimal" || s.inner.some((t) => (t.kind === "const" ? t.style : t.coefStyle) === "decimal")))
  );
  const L0 = readSide(leftIn);
  const R0 = readSide(rightIn);
  if (!L0 || !R0) return null;
  const hasParens = [...L0, ...R0].some((it) => "g" in it);
  const steps: SolverStep[] = [];

  // a line written as two whole sides (each spanning both of its columns)
  const freeLine = (l: string, r: string): GridRow => ({ cells: [l, BLANK, "=", r, BLANK], spanNext: [0, 3] });
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
  let curSlot = "__initial__";
  const initialRow = freeLine(sideTex(L, x), sideTex(R, x));
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
        const showOther = otherHasTurn ? otherDone : n === totalProducts;
        const other = showOther ? sideTex(after[otherSide], x) : BLANK;
        return sd === "left" ? freeLine(mine, other) : freeLine(other, mine);
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
              (sideDone ? (si === sides.length - 1 ? " The rest of the equation gets brought down unchanged." : ` The rest of the ${sd} side gets brought down unchanged.`) : ""),
            distributeVisual: visual,
          });
        });
      });
    });
    L = after.left;
    R = after.right;
    curSlot = nextSlot;
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
    const vcell = (k: Fraction) => (isZ(k) ? BLANK : leadTex({ coef: k, v: true }, x));
    const ccell = (k: Fraction, hasVar: boolean, emptySide: boolean) =>
      isZ(k) ? (emptySide ? "0" : BLANK) : hasVar ? `${k.num < 0 ? "-" : "+"}\\hspace{0.5em}${magTex(k)}` : numTex(k);
    return [vcell(A), ccell(B, !isZ(A), isZ(A)), "=", vcell(C), ccell(D, !isZ(C), isZ(C))];
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
      return { cells: cells.map((cl, i) => (show[i] ? cl : i === 2 ? cl : BLANK)) };
    };
    if (kindsToCombine.length) {
      kindsToCombine.forEach((k, j) => {
        done.add(`${k.side}${k.v}`);
        const total = k.ts.reduce((s, t) => addFraction(s, t.coef), fromInt(0));
        const expr = k.ts.map((t, i) => (i === 0 ? leadTex(t, x) : nextTex(t, x))).join("");
        const val = (f: Fraction) => $(isZ(f) ? "0" : leadTex({ coef: f, v: k.v }, x));
        const absSum = k.ts.reduce((s, t) => addFraction(s, absF(t.coef)), fromInt(0));
        const last = j === kindsToCombine.length - 1;
        steps.push({
          stepId: `combine_${k.side}_${k.v ? "x" : "number"}`,
          rowUpdates: [{ slotId: "combined", row: lineNow(last) }],
          prompt: `Combine the like terms on the ${k.side} side. What is ${$(expr)}?`,
          choices: withCorrect(val(total), [
            { text: val(absSum), tag: "ignored_negative_signs" },
            { text: val(neg(total)), tag: "sign_error" },
            { text: val(addFraction(total, fromInt(1))), tag: "arithmetic_slip" },
          ]),
          explanationOnCorrect:
            `${$(`${expr} = ${isZ(total) ? "0" : leadTex({ coef: total, v: k.v }, x)}`)}.` +
            (isZ(total) ? " They cancel out." : "") +
            (last ? " The rest of the equation gets brought down unchanged." : ""),
        });
      });
    } else {
      // only the order changes: x term first
      const right = $(`${sideTex([{ t: { coef: a, v: true } }, { t: { coef: b, v: false } }].filter((it) => !isZ(it.t.coef)), x)} = ${sideTex([{ t: { coef: c, v: true } }, { t: { coef: d, v: false } }].filter((it) => !isZ(it.t.coef)), x)}`);
      steps.push({
        stepId: "write_x_first",
        rowUpdates: [{ slotId: "combined", row: { cells: cellsFor(a, b, c, d) } }],
        prompt: `Nothing combines, but let's write each side with the ${x} term first. What does the equation become?`,
        choices: withCorrect(right, [
          { text: $(`${sideTex([{ t: { coef: neg(a), v: true } }, { t: { coef: b, v: false } }].filter((it) => !isZ(it.t.coef)), x)} = ${sideTex([{ t: { coef: c, v: true } }, { t: { coef: d, v: false } }].filter((it) => !isZ(it.t.coef)), x)}`), tag: "sign_error" },
          { text: $(`${sideTex([{ t: { coef: a, v: true } }, { t: { coef: neg(b), v: false } }].filter((it) => !isZ(it.t.coef)), x)} = ${sideTex([{ t: { coef: c, v: true } }, { t: { coef: d, v: false } }].filter((it) => !isZ(it.t.coef)), x)}`), tag: "sign_error" },
        ]),
        explanationOnCorrect: "Each term keeps its own sign when it moves.",
      });
    }
    curSlot = "combined";
  }

  // ---------- 3. solve ax + b = cx + d ----------
  const tail = solveTail(a, b, c, d, x, curSlot);
  if (!tail) return null;
  if (tail === FINAL_IS_CURRENT) {
    // the last line written is already "x = 5": mark it as the answer
    const last = [...steps].reverse().find((st) => st.rowUpdates.some((u) => u.slotId === curSlot));
    if (!last) return null;
    last.rowUpdates = last.rowUpdates.map((u) => (u.slotId === curSlot ? { ...u, row: { ...(u.row as GridRow), highlight: "success" } } : u));
  }
  steps.push(...tail);
  return {
    hasParens,
    instance: {
      initialRow,
      steps,
      eqColumnIndex: 2,
      columnCount: 5,
      panelRatio: "3fr 2fr",
      termAlign: "right",
    },
  };
}

// ---------- the last part: get x by itself ----------
// (returned when the line already showing is the answer, "x = 5")
const FINAL_IS_CURRENT: SolverStep[] = [];
// Starts from the line in `slot`, written as "ax | b | = | cx | d".
function solveTail(a: Fraction, b: Fraction, c: Fraction, d: Fraction, x: string, slot: string): SolverStep[] | null {
  const steps: SolverStep[] = [];
  const vTex = (k: Fraction) => leadTex({ coef: k, v: true }, x);
  const signed = (k: Fraction) => `${k.num < 0 ? "-" : "+"}\\hspace{0.5em}${magTex(k)}`;
  const note = (k: Fraction, v: boolean) => `${k.num < 0 ? "-" : "+"}${v ? bodyTex({ coef: k, v: true }, x) : magTex(k)}`;
  const say = (k: Fraction, v: boolean) => (v ? `${magTex(k) === "1" ? "" : magTex(k)}${x}` : magTex(k)).replace(/\\dfrac\{(\d+)\}\{(\d+)\}/g, "$1/$2");
  const opWords = (k: Fraction, v: boolean, flip = false) =>
    (k.num > 0) !== flip ? `Subtracting ${say(k, v)} from both sides` : `Adding ${say(k, v)} to both sides`;
  const cellsFor = (A: Fraction, B: Fraction, C: Fraction, D: Fraction, marks: number[] = []): string[] => {
    const cells = [
      isZ(A) ? BLANK : vTex(A),
      isZ(B) ? (isZ(A) ? "0" : BLANK) : isZ(A) ? numTex(B) : signed(B),
      "=",
      isZ(C) ? BLANK : vTex(C),
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
    steps.push({
      stepId: "cancel_variable_term",
      rowUpdates: [
        { slotId: cur, row: { cells: cellsFor(A, B, C, D, same ? [0, 3] : [3]) } },
        { slotId: "cancel_var_annotation", row: same ? { cells: [`MARKEDTERM:${note(neg(c), true)}`, BLANK, "", `MARKEDTERM:${note(neg(c), true)}`, BLANK] } : noteRow(true) },
        ...(same ? [{ slotId: "reduced_equation", row: { cells: cellsFor(zero, B, zero, D) } }] : []),
      ],
      prompt: `What is ${$(`${vTex(c)} ${c.num < 0 ? "+" : "-"} ${bodyTex({ coef: c, v: true }, x)}`)}?`,
      choices: withCorrect("0", [
        { text: $(vTex(makeFraction(2 * Math.abs(c.num), c.den))), tag: "flipped_the_operation" },
        { text: $(vTex(absF(c))), tag: "forgot_to_apply_operation" },
        { text: $(vTex(neg(absF(c)))), tag: "sign_error" },
      ]),
      explanationOnCorrect: same
        ? `The ${x} terms are opposites resulting in 0 on both sides, so the variable disappears completely.`
        : `The ${x} terms are opposites resulting in 0.`,
    });
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
      return steps;
    }
    const newA = addFraction(a, neg(c));
    steps.push({
      stepId: "combine_variable_term",
      rowUpdates: [{ slotId: "after_var_elim", row: { cells: cellsFor(newA, B, zero, D) } }],
      prompt: `What is ${$(`${vTex(a)} ${c.num < 0 ? "+" : "-"} ${bodyTex({ coef: c, v: true }, x)}`)}?`,
      choices: withCorrect($(isZ(newA) ? "0" : vTex(newA)), [
        { text: $(vTex(addFraction(a, c))), tag: "flipped_the_operation" },
        { text: $(vTex(neg(newA))), tag: "sign_error" },
        { text: $(vTex(addFraction(newA, fromInt(1)))), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `The terms combine to ${$(vTex(newA))}. The rest of the equation gets brought down unchanged.`,
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
    if (varLeft) row.cells = [vTex(K), BLANK, "=", BLANK, numTex(value)];
    else row.cells = [BLANK, numTex(value), "=", vTex(K), BLANK];
    steps.push({
      stepId: "combine_constant",
      rowUpdates: [{ slotId: "after_const_elim", row }],
      prompt: `What is ${$(`${numTex(other)} ${own.num < 0 ? "+" : "-"} ${magTex(own)}`)}?`,
      choices: withCorrect($(numTex(value)), [
        { text: $(numTex(addFraction(other, own))), tag: "flipped_the_operation" },
        { text: $(numTex(neg(value))), tag: "sign_error" },
        { text: $(numTex(addFraction(value, fromInt(1)))), tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: needsDivide
        ? `The terms combine to ${$(numTex(value))}. The rest of the equation gets brought down unchanged.`
        : `The terms combine to ${$(numTex(value))}. Since the coefficient of ${x} is already 1, this is the final answer.`,
    });
    cur = "after_const_elim";
    if (!needsDivide) return steps;
  } else if (eqF(K, fromInt(1))) {
    // already x = value: that line is the answer
    for (let i = steps.length - 1; i >= 0; i--) {
      const u = steps[i].rowUpdates.find((r) => r.slotId === cur);
      if (u) {
        u.row = { ...(u.row as GridRow), highlight: "success" };
        return steps;
      }
    }
    return steps.length ? steps : FINAL_IS_CURRENT;
  } else {
    // nothing to move: the current line is already "kx = value"
  }

  // ---------- divide ----------
  const answer = divFraction(value, K);
  const divRow = (marked: boolean): GridRow => {
    const top = marked ? `MARKEDFRACTION:${numTex(K)}\u0006${x}\u0005${numTex(K)}` : `\\dfrac{${eqF(K, fromInt(-1)) ? `-1${x}` : vTex(K)}}{${numTex(K)}}`;
    const val = `\\dfrac{${numTex(value)}}{${numTex(K)}}`;
    return { cells: varLeft ? [top, BLANK, "=", BLANK, val] : [BLANK, val, "=", top, BLANK] };
  };
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
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: cur, row: divRow(true) },
      { slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, "=", BLANK, BLANK] : [BLANK, BLANK, "=", x, BLANK] } },
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
  const eqText = (v: Fraction) => $(varLeft ? `${x} = ${answerTex(v)}` : `${answerTex(v)} = ${x}`);
  const sameSign = value.num >= 0 === K.num >= 0;
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: { cells: varLeft ? [x, BLANK, "=", BLANK, ansTex] : [BLANK, ansTex, "=", x, BLANK], highlight: "success" } }],
    prompt: `${$(`${numTex(value)} \\div ${K.num < 0 ? `(${numTex(K)})` : numTex(K)}`)} = ? What is the value of ${x}?`,
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
  return steps;
}
