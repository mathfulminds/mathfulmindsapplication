// Literal equations: solving a formula for one of its letters.
//
//   P = 2l + 2w        solve for w
//   d = rt             solve for t
//   ax + by = c        solve for y
//   A = ½bh            solve for h
//
// Same moves as Two-Step Equations, with letters instead of numbers:
//   1. Which term has the letter we're solving for?
//   2. Every other term on that side moves away from it ("What undoes
//      +2l?", the cancel to 0, then what that side becomes - letters that
//      aren't like terms can't be combined, so "P - 2l" stays as it is).
//   3. A fraction in front is cleared first (multiply by its reciprocal).
//   4. Whatever multiplies the letter is divided away - the WHOLE other
//      side gets divided ("P - 2l" over 2, not just the P).
//   5. Whole-number answers like (8 - 4x)/-2 are simplified to 2x - 4.
//   6. If the letter ended up on the right, the equation is written with
//      it on the left (no signs change when the sides of an equation swap).
//
// A formula is a list of terms on each side; a term is a number times
// letters (π counts as a number-like letter, never solved for).

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, SIGN_GAP, randInt, shuffle } from "./isolateVariableCore";
import type { Fraction } from "./fraction";
import { addFraction, divFraction, fromInt, makeFraction, mulFraction, negFraction } from "./fraction";

export interface Mono {
  coef: Fraction;
  letters: string[]; // in written order; "π" allowed
}

export interface LiteralProblem {
  left: Mono[];
  right: Mono[];
  target: string;
}

// ---------- rendering ----------
const PI = "π";
const letterTex = (l: string) => (l === PI ? "\\pi " : l);
const isInt = (f: Fraction) => f.den === 1;
const isOne = (f: Fraction) => f.num === 1 && f.den === 1;
const fracTex = (f: Fraction) => (isInt(f) ? `${f.num}` : `${f.num < 0 ? "-" : ""}\\dfrac{${Math.abs(f.num)}}{${f.den}}`);
const absF = (f: Fraction): Fraction => ({ num: Math.abs(f.num), den: f.den });

// The term without its sign: "2l", "bh", "\dfrac{1}{2}bh", "7".
function body(m: Mono): string {
  const c = absF(m.coef);
  const letters = m.letters.map(letterTex).join("").trim();
  if (!letters) return fracTex(c);
  return `${isOne(c) ? "" : fracTex(c)}${letters}`;
}
// "-2l" / "2l"
const natural = (m: Mono) => `${m.coef.num < 0 ? "-" : ""}${body(m)}`;
// "+ 2l" (with the grid's sign gap) / "-2l" when gap = false
const signed = (m: Mono, gap = true) => `${m.coef.num < 0 ? "-" : "+"}${gap ? SIGN_GAP : ""}${body(m)}`;

// a whole side written as one expression: "P - 2l"
function exprTex(ms: Mono[]): string {
  if (ms.length === 0) return "0";
  return ms.map((m, i) => (i === 0 ? natural(m) : `${m.coef.num < 0 ? " - " : " + "}${body(m)}`)).join("");
}

const sameLetters = (a: Mono, b: Mono) => [...a.letters].sort().join() === [...b.letters].sort().join();
const neg = (m: Mono): Mono => ({ coef: negFraction(m.coef), letters: m.letters });
const scale = (m: Mono, k: Fraction): Mono => ({ coef: mulFraction(m.coef, k), letters: m.letters });

// O + m, combining with a like term if there is one.
function addTerm(side: Mono[], m: Mono): { side: Mono[]; combinedWith: Mono | null } {
  const i = side.findIndex((s) => sameLetters(s, m));
  if (i === -1) return { side: [...side, m], combinedWith: null };
  const sum = addFraction(side[i].coef, m.coef);
  const out = [...side];
  if (sum.num === 0) out.splice(i, 1);
  else out[i] = { coef: sum, letters: m.letters };
  return { side: out, combinedWith: side[i] };
}

function dedupChoices(correct: string, wrong: { text: string; tag: string }[], n = 2): Choice[] {
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

const $ = (tex: string) => `$${tex}$`;

// ---------- which letters can be solved for ----------
// The letter appears in exactly one term, once (not squared), and isn't
// already by itself on one side (that's already solved).
export function solvableLetters(left: Mono[], right: Mono[]): string[] {
  const all = [...left, ...right];
  const letters = Array.from(new Set(all.flatMap((m) => m.letters))).filter((l) => l !== PI);
  return letters.filter((l) => {
    const holders = all.filter((m) => m.letters.includes(l));
    if (holders.length !== 1) return false;
    const m = holders[0];
    if (m.letters.filter((x) => x === l).length !== 1) return false;
    const side = left.includes(m) ? left : right;
    if (side.length === 1 && m.letters.length === 1 && isOne(m.coef)) return false;
    return true;
  });
}

// ---------- the steps ----------
export function buildLiteralInstance(p: LiteralProblem): SolverInstance {
  const { left, right, target: t } = p;
  const tInLeft = left.some((m) => m.letters.includes(t));
  const S = tInLeft ? left : right;
  const O0 = tInLeft ? right : left;
  const tIdx = S.findIndex((m) => m.letters.includes(t));
  const T = S[tIdx];
  const sideName = tInLeft ? "right" : "left"; // the side without the letter
  const e = left.length;
  const tt = letterTex(t).trim();

  // cells per side
  const sideCells = (ms: Mono[]) => ms.map((m, i) => (i === 0 ? natural(m) : signed(m)));
  const oLast = O0.length - 1; // the other side's expression sits in its last column
  const assemble = (oCells: string[], sCells: string[], eq = "=") =>
    tInLeft ? [...sCells, eq, ...oCells] : [...oCells, eq, ...sCells];
  const blanks = (n: number) => Array.from({ length: n }, () => BLANK);
  const oneCell = (tex: string) => {
    const c = blanks(O0.length);
    c[oLast] = tex;
    return c;
  };
  const row = (cells: string[], highlight?: GridRow["highlight"]): GridRow => ({ cells, ...(highlight ? { highlight } : {}) });

  const steps: SolverStep[] = [];
  const initialCells = assemble(sideCells(O0), sideCells(S));

  // 1. Which term has the letter?
  const others = [...S.filter((_, i) => i !== tIdx), ...O0];
  steps.push({
    stepId: "identify_term",
    rowUpdates: [],
    prompt: `We're solving for ${$(tt)}. Which term has the ${$(tt)} in it?`,
    choices: dedupChoices(
      $(natural(T)),
      others.map((m) => ({ text: $(natural(m)), tag: "picks_wrong_term" })),
      Math.min(2, others.length)
    ),
    explanationOnCorrect: `${$(natural(T))} has the ${$(tt)}. We'll move everything else away from it, then undo what multiplies ${$(tt)}.`,
  });

  // 2. Move every other term on that side.
  let O = O0;
  let sCells = sideCells(S);
  let oCells = sideCells(O0);
  let curSlot = "__initial__";
  let curCells = initialCells;
  let k = 0;
  S.forEach((m, j) => {
    if (j === tIdx) return;
    k++;
    const opp = neg(m);
    const ann = blanks(initialCells.length);
    ann[e] = "";
    const sCol = (tInLeft ? 0 : e + 1) + j;
    const oCol = tInLeft ? e + 1 + oLast : oLast;
    ann[sCol] = signed(opp, false);
    ann[oCol] = signed(opp, false);
    const annSlot = `move_annotation_${k}`;
    const plus = m.coef.num >= 0;
    steps.push({
      stepId: k === 1 ? "goal_move_term" : `goal_move_term_${k}`,
      rowUpdates: [{ slotId: annSlot, row: row(ann) }],
      prompt: `What undoes ${$(signed(m, false))}?`,
      choices: shuffle<Choice>([
        { text: `${plus ? "Subtracting" : "Adding"} ${$(body(m))} ${plus ? "from" : "to"} both sides`, isCorrect: true, misconceptionTag: null },
        { text: `${plus ? "Adding" : "Subtracting"} ${$(body(m))} ${plus ? "to" : "from"} both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
        { text: `${plus ? "Dividing" : "Multiplying"} both sides by ${$(body(m))}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      ]),
      explanationOnCorrect: plus
        ? `Undo addition by subtracting ${$(body(m))} from both sides.`
        : `Undo subtraction by adding ${$(body(m))} to both sides.`,
    });

    const marked = [...curCells];
    marked[sCol] = `MARKEDTERM:${curCells[sCol]}`;
    const annMarked = [...ann];
    annMarked[sCol] = `MARKEDTERM:${ann[sCol]}`;
    steps.push({
      stepId: k === 1 ? "cancel_term" : `cancel_term_${k}`,
      rowUpdates: [
        { slotId: curSlot, row: row(marked) },
        { slotId: annSlot, row: row(annMarked) },
      ],
      prompt: `What is ${$(`${natural(m)} ${plus ? "-" : "+"} ${body(m)}`)}?`,
      choices: dedupChoices("0", [
        { text: $(body(scale(m, fromInt(2)))), tag: "flipped_the_operation" },
        { text: $(body(m)), tag: "forgot_to_apply_operation" },
      ]),
      explanationOnCorrect: `The ${$(body(m))} terms are opposites resulting in 0.`,
    });

    const { side: newO, combinedWith } = addTerm(O, opp);
    const flipped = addTerm(O, m).side;
    sCells = [...sCells];
    sCells[j] = BLANK;
    oCells = oneCell(exprTex(newO));
    const lineSlot = `moved_${k}`;
    const lineCells = assemble(oCells, sCells);
    const wrong = [
      { text: $(exprTex(flipped)), tag: "flipped_the_operation" },
      { text: $(exprTex(O)), tag: "forgot_to_apply_operation" },
    ];
    if (combinedWith) {
      const slip = newO.map((x) => (sameLetters(x, opp) ? { ...x, coef: addFraction(x.coef, fromInt(1)) } : x));
      wrong.push({ text: $(exprTex(slip)), tag: "arithmetic_slip" });
    }
    steps.push({
      stepId: k === 1 ? "combine_side" : `combine_side_${k}`,
      rowUpdates: [{ slotId: lineSlot, row: row(lineCells) }],
      prompt: `What does the ${sideName} side become?`,
      choices: dedupChoices($(exprTex(newO)), wrong),
      explanationOnCorrect: combinedWith
        ? `${$(natural(combinedWith))} and ${$(signed(opp, false))} are like terms, so they combine: the ${sideName} side is ${$(exprTex(newO))}. The rest of the equation gets brought down unchanged.`
        : `${exprTex(O) === "0" ? "" : `${$(exprTex(O))} and ${$(body(m))} aren't like terms, so they can't be combined. `}The ${sideName} side is ${$(exprTex(newO))}. The rest of the equation gets brought down unchanged.`,
    });
    O = newO;
    curSlot = lineSlot;
    curCells = lineCells;
  });

  // 3. A fraction in front of the letter's term: multiply by its reciprocal.
  let oTex = exprTex(O); // the other side, as one expression
  let oPlainFlat = true; // no braces: can be divided in place
  let oMonos: Mono[] | null = O; // null once it's grouped like 2(y - b)
  let tMono = T;
  if (!isInt(T.coef)) {
    const recip = divFraction(fromInt(1), T.coef); // carries the sign
    const recipTex = fracTex(recip);
    tMono = { coef: fromInt(1), letters: T.letters };
    if (O.length === 1) {
      oMonos = [scale(O[0], recip)];
      oTex = exprTex(oMonos);
    } else {
      oMonos = null;
      oTex = `${recipTex}(${exprTex(O)})`;
    }
    oPlainFlat = !/[{}]/.test(oTex);
    const sNew = blanks(S.length);
    sNew[tIdx] = natural(tMono);
    const cells = assemble(oneCell(oTex), sNew);
    steps.push({
      stepId: "clear_fraction",
      rowUpdates: [{ slotId: "cleared", row: row(cells) }],
      prompt: `The ${$(tt)} term is multiplied by ${$(fracTex(T.coef))}. What undoes multiplying by ${$(fracTex(T.coef))}?`,
      choices: dedupChoices(`Multiplying both sides by ${$(recipTex)}`, [
        { text: `Dividing both sides by ${$(recipTex)}`, tag: "confuses_reciprocal_operation" },
        { text: `Multiplying both sides by ${$(fracTex(T.coef))}`, tag: "uses_same_fraction" },
        { text: `Multiplying only the ${$(tt)} side by ${$(recipTex)}`, tag: "one_side_only" },
      ]),
      explanationOnCorrect: `${$(`${fracTex(T.coef)} \\times ${recipTex} = 1`)}, so the fraction is gone. The whole ${sideName} side gets multiplied by ${$(recipTex)}.`,
    });
    curSlot = "cleared";
    curCells = cells;
  }

  // 4. Divide away whatever multiplies the letter.
  const kLetters = [...tMono.letters];
  kLetters.splice(kLetters.indexOf(t), 1);
  const K: Mono = { coef: tMono.coef, letters: kLetters };
  const needsDivide = !(isOne(K.coef) && kLetters.length === 0);
  let finalTex = oTex;
  let finalMonos: Mono[] | null = oMonos; // the answer as terms, when it is a plain sum
  const isolatedCells = (tex: string) => {
    const s = blanks(S.length);
    s[tIdx] = tt;
    return assemble(oneCell(tex), s);
  };
  if (needsDivide) {
    const kTex = natural(K); // "2", "r", "2\pi ", "-3", "lw"
    const kPlain = kTex.trim();
    const sNow = blanks(S.length);
    const tBody = natural(tMono);
    const canInPlace = curSlot !== "__initial__" && oPlainFlat;
    const divSlot = canInPlace ? curSlot : "divided";
    sNow[tIdx] = `\\dfrac{${tBody}}{${kPlain}}`;
    const divCells = assemble(oneCell(`\\dfrac{${oTex}}{${kPlain}}`), sNow);
    const one = O.length === 1 || oMonos === null;
    steps.push({
      stepId: "eliminate_coefficient",
      rowUpdates: [{ slotId: divSlot, row: row(divCells) }],
      prompt: `What undoes multiplying ${$(tt)} by ${$(kPlain)}?`,
      choices: dedupChoices(`Dividing both sides by ${$(kPlain)}`, [
        { text: `Multiplying both sides by ${$(kPlain)}`, tag: "confuses_inverse_operation" },
        { text: `Dividing only the ${$(tt)} side by ${$(kPlain)}`, tag: "one_side_only" },
        { text: `Subtracting ${$(kPlain)} from both sides`, tag: "confuses_additive_and_multiplicative_inverse" },
      ]),
      explanationOnCorrect: one
        ? `${$(kPlain)} cancels when we divide both sides by ${$(kPlain)}.`
        : `${$(kPlain)} cancels when we divide both sides by ${$(kPlain)}. The whole ${sideName} side, ${$(oTex)}, gets divided - not just one term.`,
    });
    const sMarked = blanks(S.length);
    // The canceled part, crossed out where it sits: before the letter, after
    // it, or both ("mx" over "x" solving for m keeps the order m, x).
    const at = tMono.letters.indexOf(t);
    const beforeK = natural({ coef: tMono.coef, letters: tMono.letters.slice(0, at) }).replace(/^1$/, "").replace(/^-1$/, "-").trim();
    const afterK = tMono.letters.slice(at + 1).map(letterTex).join("").trim();
    sMarked[tIdx] = afterK
      ? `MARKEDFRACTION:${beforeK}\u0006${tt}\u0006${afterK}\u0005${kPlain}`
      : `MARKEDFRACTION:${kPlain}\u0006${tt}\u0005${kPlain}`;
    const markedCells = assemble(oneCell(`\\dfrac{${oTex}}{${kPlain}}`), sMarked);
    const isoBlank = blanks(S.length);
    isoBlank[tIdx] = tt;
    steps.push({
      stepId: "confirm_coefficient_one",
      rowUpdates: [
        { slotId: divSlot, row: row(markedCells) },
        { slotId: "isolated", row: row(assemble(blanks(O0.length), isoBlank)) },
      ],
      prompt: `What is ${$(`${kPlain} \\div ${kPlain}`)}?`,
      choices: dedupChoices("1", [
        { text: "0", tag: "confuses_division_with_subtraction_pattern" },
        { text: $(kPlain), tag: "forgot_to_apply_operation" },
      ]),
      explanationOnCorrect: `Anything divided by itself is 1, so ${$(tt)} is by itself.`,
    });

    finalTex = `\\dfrac{${oTex}}{${kPlain}}`;
    finalMonos = null;
    const wrong: { text: string; tag: string }[] = [];
    if (oMonos && oMonos.length > 1) {
      wrong.push({ text: $(`\\dfrac{${natural(oMonos[0])}}{${kPlain}}${oMonos.slice(1).map((m) => (m.coef.num < 0 ? " - " : " + ") + body(m)).join("")}`), tag: "divides_only_one_term" });
    }
    wrong.push({ text: $(`\\dfrac{${kPlain}}{${oTex}}`), tag: "flips_the_division" });
    wrong.push({ text: $(oMonos && oMonos.length > 1 ? `${kPlain}(${oTex})` : `${oTex}${kPlain}`), tag: "multiplies_instead" });

    // whole-number simplifying: (8 - 4x) / -2 -> 2x - 4
    const kNum = kLetters.length === 0 && isInt(K.coef) ? K.coef.num : null;
    const simplifiable =
      kNum !== null && oMonos !== null && oMonos.length > 0 && oMonos.every((m) => isInt(m.coef) && m.coef.num % kNum === 0);
    steps.push({
      stepId: "compute_value",
      rowUpdates: [{ slotId: "isolated", row: row(isolatedCells(finalTex), tInLeft && !simplifiable ? "success" : undefined) }],
      prompt: `So what does ${$(tt)} equal?`,
      choices: dedupChoices($(finalTex), wrong),
      explanationOnCorrect: `${$(tt)} is equal to the whole ${sideName} side divided by ${$(kPlain)}: ${$(finalTex)}.`,
    });

    if (simplifiable) {
      const divided = oMonos!.map((m) => ({ coef: makeFraction(m.coef.num, kNum!), letters: m.letters }));
      // letters first, then the number (like y = mx + b)
      const ordered = [...divided.filter((m) => m.letters.length > 0), ...divided.filter((m) => m.letters.length === 0)];
      const simple = exprTex(ordered);
      const onlyFirst = exprTex([divided[0], ...oMonos!.slice(1)]);
      const signSlip = exprTex(ordered.map((m, i) => (i === ordered.length - 1 ? neg(m) : m)));
      finalTex = simple;
      finalMonos = ordered;
      steps.push({
        stepId: "simplify",
        rowUpdates: [{ slotId: "simplified", row: row(isolatedCells(simple), tInLeft ? "success" : undefined) }],
        prompt: `Every term divides evenly by ${$(`${kNum}`)}. What is ${$(`\\dfrac{${oTex}}{${kNum}}`)} simplified?`,
        choices: dedupChoices($(simple), [
          { text: $(onlyFirst), tag: "divides_only_one_term" },
          { text: $(signSlip), tag: "sign_error" },
        ]),
        explanationOnCorrect: `Divide each term by ${$(`${kNum}`)}: ${$(simple)}.`,
      });
    }
  } else if (curSlot !== "__initial__" && tInLeft) {
    // nothing multiplies the letter: the last line is the answer
    const last = steps[steps.length - 1];
    last.rowUpdates = last.rowUpdates.map((u) => (u.slotId === curSlot ? { ...u, row: { ...u.row, highlight: "success" } } : u));
    last.explanationOnCorrect += ` Since ${$(tt)} is already by itself, that's the answer.`;
  }

  // 5. Letter on the right: write it on the left.
  if (!tInLeft) {
    const answer = `${tt} = ${finalTex}`;
    const lCells = blanks(O0.length);
    lCells[oLast] = tt;
    const rCells = blanks(S.length);
    rCells[0] = finalTex;
    // the same answer with its signs changed (a common slip when swapping)
    const negFinal = finalMonos ? exprTex(finalMonos.map(neg)) : finalTex.startsWith("-") ? finalTex.slice(1) : `-${finalTex}`;
    steps.push({
      stepId: "canonicalize_orientation",
      rowUpdates: [{ slotId: "rewritten", row: row([...lCells, "=", ...rCells], "success") }],
      prompt: `Let's write it with ${$(tt)} on the left. Which equation means the same thing?`,
      choices: dedupChoices($(answer), [
        { text: $(`${tt} = ${negFinal}`), tag: "changes_sign_on_swap" },
        { text: $(`-${tt} = ${finalTex}`), tag: "changes_sign_on_swap" },
      ]),
      explanationOnCorrect: `Swapping the two sides of an equation doesn't change anything - no signs change: ${$(answer)}.`,
    });
  }

  // The answer (the formula solved for the letter) is boxed, all of it.
  for (const st of steps) {
    for (const u of st.rowUpdates) {
      const r = u.row as GridRow;
      if (r.highlight === "success" && r.cells?.length) u.row = { ...r, boxCols: [r.cells.map((_c, i) => i)] };
    }
  }

  return {
    initialRow: row(initialCells),
    steps,
    eqColumnIndex: e,
    columnCount: initialCells.length,
    termAlign: "right",
    problemText: `Solve for $${tt}$.`,
  };
}

// ---------- practice problems ----------
const M = (coef: number | [number, number], ...letters: string[]): Mono => ({
  coef: Array.isArray(coef) ? makeFraction(coef[0], coef[1]) : fromInt(coef),
  letters,
});

const BANK: { left: Mono[]; right: Mono[] }[] = [
  { left: [M(1, "A")], right: [M(1, "l", "w")] },
  { left: [M(1, "d")], right: [M(1, "r", "t")] },
  { left: [M(1, "V")], right: [M(1, "l", "w", "h")] },
  { left: [M(1, "I")], right: [M(1, "p", "r", "t")] },
  { left: [M(1, "P")], right: [M(2, "l"), M(2, "w")] },
  { left: [M(1, "y")], right: [M(1, "m", "x"), M(1, "b")] },
  { left: [M(1, "A")], right: [M([1, 2], "b", "h")] },
  { left: [M(1, "C")], right: [M(2, PI, "r")] },
  { left: [M(1, "F")], right: [M([9, 5], "C"), M(32)] },
  { left: [M(1, "P")], right: [M(1, "a"), M(1, "b"), M(1, "c")] },
  { left: [M(1, "a", "x"), M(1, "b", "y")], right: [M(1, "c")] },
  { left: [M(2, "x"), M(3, "y")], right: [M(12)] },
  { left: [M(4, "x"), M(-2, "y")], right: [M(8)] },
  { left: [M(6, "x"), M(3, "y")], right: [M(9)] },
  { left: [M(5, "x"), M(1, "y")], right: [M(10)] },
  { left: [M(1, "y"), M(-3, "x")], right: [M(7)] },
  { left: [M(1, "A")], right: [M(1, "P"), M(1, "P", "r", "t")] },
  { left: [M(1, "y")], right: [M(1, "a", "x"), M(1, "c")] },
];

export function generateLiteralEquation(): LiteralProblem {
  for (;;) {
    const f = BANK[randInt(0, BANK.length - 1)];
    const letters = solvableLetters(f.left, f.right);
    if (letters.length === 0) continue;
    return { left: f.left, right: f.right, target: letters[randInt(0, letters.length - 1)] };
  }
}

export function generateLiteralInstance(): SolverInstance {
  return buildLiteralInstance(generateLiteralEquation());
}
