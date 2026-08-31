import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { BLANK, randBool, randInt, renderConstant, renderMultiplyTerm } from "./isolateVariableCore";

// ---------- shared small helpers ----------

function plainTerm(coef: number, symbol: string): string {
  if (coef === 1) return symbol;
  if (coef === -1) return `-${symbol}`;
  return `${coef}${symbol}`;
}
function plainSignedConst(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
function plainSignedTerm(coef: number, symbol: string): string {
  if (coef === 1) return `+${symbol}`;
  if (coef === -1) return `-${symbol}`;
  const sign = coef >= 0 ? "+" : "-";
  return `${sign}${Math.abs(coef)}${symbol}`;
}
// For writing a term from its ALREADY-positive magnitude (e.g. "opAbs"
// variables that track Math.abs(coef) separately from sign) - omits the
// redundant "1" the same way plainTerm does, so "1x"/"-1x" never leak
// into a prompt or choice through this path either.
function plainAbsTerm(abs: number, symbol: string): string {
  return abs === 1 ? symbol : `${abs}${symbol}`;
}
// Appended to a combine explanation whenever either operand has an
// implicit (unwritten) coefficient of 1 or -1, since "x" and "-x" not
// visibly showing a number can be genuinely confusing mid-combine.
function impliedCoefficientNote(coef1: number, coef2: number, x: string): string {
  return impliedCoefficientNoteMulti([coef1, coef2], x);
}
function impliedCoefficientNoteMulti(values: number[], x: string): string {
  const hasPlus1 = values.includes(1);
  const hasMinus1 = values.includes(-1);
  if (!hasPlus1 && !hasMinus1) return "";
  if (hasPlus1 && hasMinus1) return ` Remember, ${x} means +1${x} and -${x} means -1${x}.`;
  return hasPlus1 ? ` Remember, ${x} means +1${x}.` : ` Remember, -${x} means -1${x}.`;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dedupNumeric(
  correctText: string,
  candidates: { text: string; tag: string }[]
): { text: string; tag: string }[] {
  const seen = new Set([correctText]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === 2) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

// Splits `target` into exactly `count` nonzero integers that sum to it
// exactly, in random order and random visual position - this is how a
// side ends up with, say, 3 separate x-terms that combine to a single
// target coefficient. `count === 1` just returns the target itself
// (nothing to split).
function splitIntoTerms(target: number, count: number, pieceMagMin: number, pieceMagMax: number): number[] {
  if (count === 1) return [target];
  for (let attempt = 0; attempt < 100; attempt++) {
    const pieces: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      pieces.push(randInt(pieceMagMin, pieceMagMax) * (randBool() ? 1 : -1));
    }
    const last = target - pieces.reduce((a, b) => a + b, 0);
    if (last === 0) continue;
    pieces.push(last);
    if (pieces.every((v) => v !== 0)) return shuffle(pieces);
  }
  const pieces = new Array(count - 1).fill(0).map(() => randInt(pieceMagMin, pieceMagMax) * (randBool() ? 1 : -1));
  let last = target - pieces.reduce((a, b) => a + b, 0);
  if (last === 0) {
    pieces[0] += 1;
    last -= 1;
  }
  return shuffle([...pieces, last]);
}

// ---------- term-count range ----------
// Capped at 1-3 terms per side for now - the up-to-6 version had too many
// compounding issues (long combine chains, wide grids) to trust yet.
// Revisit widening this once this smaller range is solid.
const TERM_RANGE: [number, number] = [1, 3];

// ---------- side construction ----------

interface RawTerm {
  type: "x" | "const";
  value: number;
}

interface SideBuild {
  terms: RawTerm[];
  finalCoef: number;
  finalConst: number;
  xAnchorIndex: number | null;
  constAnchorIndex: number | null;
}

function buildSide(finalCoef: number, finalConst: number, totalRange: [number, number]): SideBuild {
  const hasX = finalCoef !== 0;
  const hasConst = finalConst !== 0;

  let numX = 0;
  let numConst = 0;
  if (hasX && hasConst) {
    // Need room for at least one of each type - total=1 is impossible
    // here (can't fit both a variable term and a constant into a single
    // slot), so the minimum is raised to 2 regardless of the tier's own
    // floor.
    const minTotal = Math.max(totalRange[0], 2);
    const total = randInt(minTotal, Math.max(totalRange[1], minTotal));
    const minX = Math.max(1, total - 5);
    const maxX = Math.min(5, total - 1);
    numX = randInt(minX, maxX);
    numConst = total - numX;
  } else if (hasX) {
    numX = randInt(Math.max(1, totalRange[0]), Math.min(5, totalRange[1]));
  } else if (hasConst) {
    numConst = randInt(Math.max(1, totalRange[0]), Math.min(5, totalRange[1]));
  } else {
    numConst = 1;
  }

  const xValues = numX > 0 ? splitIntoTerms(finalCoef, numX, 1, 9) : [];
  const constValues = numConst > 0 ? splitIntoTerms(finalConst, numConst, 1, 15) : hasX || hasConst ? [] : [0];

  const terms: RawTerm[] = shuffle([
    ...xValues.map((v): RawTerm => ({ type: "x", value: v })),
    ...constValues.map((v): RawTerm => ({ type: "const", value: v })),
  ]);

  const xAnchorIndex = terms.findIndex((t) => t.type === "x");
  const constAnchorIndex = terms.findIndex((t) => t.type === "const");

  return {
    terms,
    finalCoef,
    finalConst,
    xAnchorIndex: xAnchorIndex === -1 ? null : xAnchorIndex,
    constAnchorIndex: constAnchorIndex === -1 ? null : constAnchorIndex,
  };
}

function renderSideCells(terms: RawTerm[], x: string): string[] {
  return terms.map((t, i) => {
    const natural = i === 0;
    return t.type === "x" ? renderMultiplyTerm(t.value, x, !natural) : renderConstant(t.value, !natural);
  });
}

// ---------- equation generation ----------

interface EquationInstance {
  aLeft: number;
  aRight: number;
  bLeft: number;
  bRight: number;
  solution: number;
  leftSide: SideBuild;
  rightSide: SideBuild;
}

// True if this side has 2+ terms of the same type, meaning it needs an
// actual combine step rather than already being fully simplified.
function needsCombine(side: SideBuild): boolean {
  const xCount = side.terms.filter((t) => t.type === "x").length;
  const cCount = side.terms.filter((t) => t.type === "const").length;
  return xCount >= 2 || cCount >= 2;
}

export function generateEquation(): EquationInstance {
  const range = TERM_RANGE;

  let solution = randInt(-10, 10);
  while (solution === 0) solution = randInt(-10, 10);

  // The variable can end up on both sides, or on just one - both are
  // real, valid equation shapes.
  const leftHasX = Math.random() < 0.85;
  const rightHasX = leftHasX ? Math.random() < 0.85 : true; // guarantee a variable exists somewhere

  let aLeft = 0;
  if (leftHasX) {
    aLeft = randInt(1, 9) * (randBool() ? 1 : -1);
    while (aLeft === 0) aLeft = randInt(1, 9) * (randBool() ? 1 : -1);
  }

  const bLeft = randInt(-15, 15);

  let aRight = 0;
  if (rightHasX) {
    aRight = randInt(1, 9) * (randBool() ? 1 : -1);
    while (aRight === 0 || aRight === aLeft) aRight = randInt(1, 9) * (randBool() ? 1 : -1);
  }

  let bRight = (aLeft - aRight) * solution + bLeft;
  if (aLeft !== 0 && aRight !== 0) {
    // When both sides have a variable, the right side always ends up
    // holding the final answer (newRhs, then the divided fraction, then
    // the solution) - so it always needs a real reserved constant
    // column, even if this side started out with no constant term of
    // its own to show. Regenerate rather than land on exactly 0, which
    // would leave nowhere to write those later values.
    let tries = 0;
    while (bRight === 0 && tries < 50) {
      solution = randInt(-10, 10);
      while (solution === 0) solution = randInt(-10, 10);
      bRight = (aLeft - aRight) * solution + bLeft;
      tries++;
    }
  }

  let leftSide = buildSide(aLeft, bLeft, range);
  let rightSide = buildSide(aRight, bRight, range);
  // This skill's whole point is practicing combining like terms -
  // guarantee at least one side actually needs it, so a generated
  // problem never collapses into something the One-Step, Two-Step, or
  // Variables-on-Both-Sides skills already cover. Re-rolling just the
  // term composition (not aLeft/bLeft/aRight/bRight themselves) until
  // that holds.
  let tries = 0;
  while (!needsCombine(leftSide) && !needsCombine(rightSide) && tries < 50) {
    leftSide = buildSide(aLeft, bLeft, range);
    rightSide = buildSide(aRight, bRight, range);
    tries++;
  }

  return { aLeft, aRight, bLeft, bRight, solution, leftSide, rightSide };
}

// ---------- combine-step MCQ builders ----------
// Builds ONE MCQ that combines ALL like terms in a group at once (2 or 3
// terms), rather than pairwise sequential steps - an 8th grader can
// reasonably combine three like terms in a single move.

function buildCombineVarStepN(values: number[], x: string, sideLabel: string) {
  const combined = values.reduce((a, b) => a + b, 0);
  let promptStr = plainTerm(values[0], x);
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    promptStr += ` ${v >= 0 ? "+" : "-"} ${plainAbsTerm(Math.abs(v), x)}`;
  }
  const correct = plainTerm(combined, x);
  const candidates: { text: string; tag: string }[] =
    values.length === 3
      ? [{ text: plainTerm(values[0] + values[1], x), tag: "forgot_third_term" }]
      : [{ text: plainTerm(values[0] - values[1], x), tag: "flipped_the_operation" }];
  candidates.push({ text: plainTerm(-combined, x), tag: "sign_error" }, { text: plainTerm(combined + 1, x), tag: "arithmetic_slip" });
  const distractors = dedupNumeric(correct, candidates);
  const choices: Choice[] = shuffle([
    { text: correct, isCorrect: true, misconceptionTag: null },
    { text: distractors[0].text, isCorrect: false, misconceptionTag: distractors[0].tag },
    { text: distractors[1].text, isCorrect: false, misconceptionTag: distractors[1].tag },
  ]);
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${promptStr}?`,
    choices,
    explanation: `The terms combine to ${plainTerm(combined, x)}.${impliedCoefficientNoteMulti(values, x)}`,
  };
}

function buildCombineConstStepN(values: number[], sideLabel: string) {
  const combined = values.reduce((a, b) => a + b, 0);
  let promptStr = `${values[0]}`;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    promptStr += ` ${v >= 0 ? "+" : "-"} ${Math.abs(v)}`;
  }
  const correct = `${combined}`;
  const candidates: { text: string; tag: string }[] =
    values.length === 3
      ? [{ text: `${values[0] + values[1]}`, tag: "forgot_third_term" }]
      : [{ text: `${values[0] - values[1]}`, tag: "flipped_the_operation" }];
  candidates.push({ text: `${-combined}`, tag: "sign_error" }, { text: `${combined + 1}`, tag: "arithmetic_slip" });
  const distractors = dedupNumeric(correct, candidates);
  const choices: Choice[] = shuffle([
    { text: correct, isCorrect: true, misconceptionTag: null },
    { text: distractors[0].text, isCorrect: false, misconceptionTag: distractors[0].tag },
    { text: distractors[1].text, isCorrect: false, misconceptionTag: distractors[1].tag },
  ]);
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${promptStr}?`,
    choices,
    explanation: `The constants combine to ${combined}.`,
  };
}

// ---------- assembly ----------

export function buildSolverInstance(eq: EquationInstance, variableSymbol: string = "x"): SolverInstance {
  const { aLeft, aRight, bLeft, bRight, solution, leftSide, rightSide } = eq;
  const x = variableSymbol;

  const leftCount = leftSide.terms.length;
  const rightCount = rightSide.terms.length;
  const eqIndex = leftCount;
  const rightOffset = leftCount + 1;

  const leftInitialCells = renderSideCells(leftSide.terms, x);
  const rightInitialCells = renderSideCells(rightSide.terms, x);

  const initialRow: GridRow = { cells: [...leftInitialCells, "=", ...rightInitialCells] };

  let working: string[] = [...leftInitialCells, "=", ...rightInitialCells];
  const steps: SolverStep[] = [];

  // At most one type (x or const) ever needs combining per side, since
  // TERM_RANGE tops out at 3 terms and a side would need 4+ to have two
  // separate groups of 2+.
  function computeCombine(side: SideBuild, type: "x" | "const") {
    const indices = side.terms.map((_, i) => i).filter((i) => side.terms[i].type === type);
    if (indices.length < 2) return null;
    const values = indices.map((i) => side.terms[i].value);
    return { type, values, indices, combined: values.reduce((a, b) => a + b, 0), anchorLocalIndex: indices[0], isNaturalAnchor: indices[0] === 0 };
  }
  type Combine = NonNullable<ReturnType<typeof computeCombine>>;

  function applyCombine(sideCells: string[], combine: Combine): string[] {
    const c = [...sideCells];
    c[combine.anchorLocalIndex] =
      combine.type === "x" ? renderMultiplyTerm(combine.combined, x, !combine.isNaturalAnchor) : renderConstant(combine.combined, !combine.isNaturalAnchor);
    for (let k = 1; k < combine.indices.length; k++) c[combine.indices[k]] = BLANK;
    return c;
  }

  const leftCombine = computeCombine(leftSide, "x") ?? computeCombine(leftSide, "const");
  const rightCombine = computeCombine(rightSide, "x") ?? computeCombine(rightSide, "const");

  // Both combine steps target the SAME shared line - left combining first
  // (right shown blank if it still has its own pending reveal, or shown
  // immediately if it needs no work), then right combining fills in what
  // was left blank. Exactly one new line results, not one per operation.
  const combinedRowSlot = "combined_row";

  if (leftCombine) {
    const info =
      leftCombine.type === "x"
        ? buildCombineVarStepN(leftCombine.values, x, "left")
        : buildCombineConstStepN(leftCombine.values, "left");
    const revealLeftCells = applyCombine(leftInitialCells, leftCombine);
    const revealRightCells = rightCombine ? rightInitialCells.map(() => BLANK) : rightInitialCells;
    steps.push({
      stepId: "combine_left",
      rowUpdates: [{ slotId: combinedRowSlot, row: { cells: [...revealLeftCells, "=", ...revealRightCells] } }],
      prompt: info.prompt,
      choices: info.choices,
      explanationOnCorrect: `${info.explanation} The rest of the left side of the equation gets brought down unchanged.`,
    });
  }

  if (rightCombine) {
    const info =
      rightCombine.type === "x"
        ? buildCombineVarStepN(rightCombine.values, x, "right")
        : buildCombineConstStepN(rightCombine.values, "right");
    const currentLeftCells = leftCombine ? applyCombine(leftInitialCells, leftCombine) : leftInitialCells;
    const revealRightCells = applyCombine(rightInitialCells, rightCombine);
    steps.push({
      stepId: "combine_right",
      rowUpdates: [{ slotId: combinedRowSlot, row: { cells: [...currentLeftCells, "=", ...revealRightCells] } }],
      prompt: info.prompt,
      choices: info.choices,
      explanationOnCorrect: `${info.explanation} The rest of the right side of the equation gets brought down unchanged.`,
    });
  }

  // `working` carries the fully-resolved post-combine state forward into
  // the isolate phase below, regardless of how many reveals actually fired.
  const finalLeftCells = leftCombine ? applyCombine(leftInitialCells, leftCombine) : leftInitialCells;
  const finalRightCells = rightCombine ? applyCombine(rightInitialCells, rightCombine) : rightInitialCells;
  working = [...finalLeftCells, "=", ...finalRightCells];

  const leftXCol = leftSide.xAnchorIndex !== null ? leftSide.xAnchorIndex : null;
  const leftConstCol = leftSide.constAnchorIndex !== null ? leftSide.constAnchorIndex : null;
  const rightXCol = rightSide.xAnchorIndex !== null ? rightOffset + rightSide.xAnchorIndex : null;
  const rightConstCol = rightSide.constAnchorIndex !== null ? rightOffset + rightSide.constAnchorIndex : null;

  function setCol(row: string[], col: number | null, value: string) {
    if (col !== null) row[col] = value;
  }
  function blankCol(row: string[], col: number | null) {
    if (col !== null) row[col] = BLANK;
  }
  // Matches variablesBothSides.ts's annotation-row convention exactly:
  // an annotation row shows ONLY the value(s) being canceled - every
  // other cell blank, including the equals sign - rather than carrying
  // forward the rest of the current row. Carrying the rest forward was
  // the actual bug: it made a partial annotation look like a fully
  // populated equation with a missing "=", instead of an obvious,
  // isolated pair of cancellation marks.
  const totalCols = leftCount + 1 + rightCount;
  function minimalRow(...populated: { col: number | null; value: string }[]): string[] {
    const row = new Array(totalCols).fill(BLANK);
    row[eqIndex] = "";
    for (const p of populated) setCol(row, p.col, p.value);
    return row;
  }
  // Like minimalRow, but keeps the "=" visible - used for a line that's
  // genuinely still an equation (one side resolved, the other still
  // pending), rather than a cancellation annotation.
  function partialRow(...populated: { col: number | null; value: string }[]): string[] {
    const row = new Array(totalCols).fill(BLANK);
    row[eqIndex] = "=";
    for (const p of populated) setCol(row, p.col, p.value);
    return row;
  }
  // True if this column is the first term of its side (column 0 for the
  // left side, or the first column of the right side) - the position
  // that ALWAYS renders gap-free in a real row, regardless of what's
  // shown there. An annotation landing in this column must also render
  // gap-free to match that row's width in this column; anywhere else,
  // real rows always carry the gap, so the annotation must too - or the
  // grid's shared auto-sized column width mismatches between rows
  // sharing that column, throwing off the centering (this was the
  // actual cause of "the cancel mark doesn't line up" - not a fixed
  // choice about annotations in general).
  function isLeadingCol(col: number | null): boolean {
    return col === 0 || col === rightOffset;
  }

  const bothHaveX = aLeft !== 0 && aRight !== 0;

  if (bothHaveX) {
    const opAbs = Math.abs(aRight);
    const opSym = aRight >= 0 ? "-" : "+";
    const newA = aLeft - aRight;
    const aRightPositive = aRight >= 0;

    const cancelVarDisplay1 = renderMultiplyTerm(-aRight, x, true, !isLeadingCol(leftXCol));
    const cancelVarDisplay2 = renderMultiplyTerm(-aRight, x, true, !isLeadingCol(rightXCol));
    const cancelRow1 = minimalRow({ col: leftXCol, value: cancelVarDisplay1 }, { col: rightXCol, value: cancelVarDisplay2 });

    steps.push({
      stepId: "goal_variable_left",
      rowUpdates: [{ slotId: "cancel_var_annotation", row: { cells: cancelRow1 } }],
      prompt: `Let's move the variable to the left side. What undoes ${plainSignedTerm(aRight, x)}?`,
      choices: shuffle([
        {
          text: aRightPositive
            ? `Subtracting ${plainAbsTerm(opAbs, x)} from both sides`
            : `Adding ${plainAbsTerm(opAbs, x)} to both sides`,
          isCorrect: true,
          misconceptionTag: null,
        },
        {
          text: aRightPositive
            ? `Adding ${plainAbsTerm(opAbs, x)} to both sides`
            : `Subtracting ${plainAbsTerm(opAbs, x)} from both sides`,
          isCorrect: false,
          misconceptionTag: "flipped_the_operation",
        },
        {
          text:
            bRight >= 0 ? `Subtracting ${Math.abs(bRight)} from both sides` : `Adding ${Math.abs(bRight)} to both sides`,
          isCorrect: false,
          misconceptionTag: "targets_wrong_term_first",
        },
      ]),
      explanationOnCorrect: "In order to get the variable term on the left side, we have to undo the right side.",
    });

    const cancel1Distractors = dedupNumeric("0", [
      { text: `${2 * opAbs}${x}`, tag: "flipped_the_operation" },
      { text: `${plainAbsTerm(opAbs, x)}`, tag: "forgot_to_apply_operation" },
    ]);
    steps.push({
      stepId: "cancel_variable_term",
      rowUpdates: [],
      prompt: `What is ${plainAbsTerm(opAbs, x)} ${opSym} ${plainAbsTerm(opAbs, x)}?`,
      choices: shuffle([
        { text: "0", isCorrect: true, misconceptionTag: null },
        { text: cancel1Distractors[0].text, isCorrect: false, misconceptionTag: cancel1Distractors[0].tag },
        { text: cancel1Distractors[1].text, isCorrect: false, misconceptionTag: cancel1Distractors[1].tag },
      ]),
      explanationOnCorrect: `The ${plainAbsTerm(opAbs, x)} terms are opposites resulting in 0.`,
    });

    working = [...working];
    setCol(working, leftXCol, renderMultiplyTerm(newA, x, leftXCol !== 0));
    blankCol(working, rightXCol);
    steps.push({
      stepId: "combine_variable_term",
      rowUpdates: [{ slotId: "after_var_elim", row: { cells: working } }],
      prompt: `What is ${plainTerm(aLeft, x)} ${opSym} ${plainAbsTerm(opAbs, x)}?`,
      choices: (() => {
        const combine1FlipValue = opSym === "-" ? aLeft + opAbs : aLeft - opAbs;
        const d = dedupNumeric(plainTerm(newA, x), [
          { text: plainTerm(combine1FlipValue, x), tag: "flipped_the_operation" },
          { text: plainTerm(-newA, x), tag: "sign_error" },
          { text: plainTerm(newA + 1, x), tag: "arithmetic_slip" },
        ]);
        return shuffle([
          { text: plainTerm(newA, x), isCorrect: true, misconceptionTag: null },
          { text: d[0].text, isCorrect: false, misconceptionTag: d[0].tag },
          { text: d[1].text, isCorrect: false, misconceptionTag: d[1].tag },
        ]);
      })(),
      explanationOnCorrect: `The terms combine to ${plainTerm(newA, x)}.${impliedCoefficientNote(aLeft, -aRight, x)} The rest of the equation gets brought down unchanged.`,
    });

    let newRhs = bRight;
    let divideSlotId = "after_var_elim";

    if (bLeft !== 0) {
      const op2Abs = Math.abs(bLeft);
      const op2Sym = bLeft >= 0 ? "-" : "+";
      const bLeftPositive = bLeft >= 0;

      const cancelConstDisplay1 = renderConstant(-bLeft, true, !isLeadingCol(leftConstCol));
      const cancelConstDisplay2 = renderConstant(-bLeft, true, !isLeadingCol(rightConstCol));
      const cancelRow2 = minimalRow(
        { col: leftConstCol, value: cancelConstDisplay1 },
        { col: rightConstCol, value: cancelConstDisplay2 }
      );

      steps.push({
        stepId: "goal_constant_right",
        rowUpdates: [{ slotId: "cancel_const_annotation", row: { cells: cancelRow2 } }],
        prompt: `Let's move the constant to the right side. What undoes ${plainSignedConst(bLeft)}?`,
        choices: shuffle([
          {
            text: bLeftPositive ? `Subtracting ${op2Abs} from both sides` : `Adding ${op2Abs} to both sides`,
            isCorrect: true,
            misconceptionTag: null,
          },
          {
            text: `${bLeftPositive ? "Dividing" : "Multiplying"} both sides by ${op2Abs}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          {
            text: bLeftPositive ? `Adding ${op2Abs} to both sides` : `Subtracting ${op2Abs} from both sides`,
            isCorrect: false,
            misconceptionTag: "flipped_the_operation",
          },
        ]),
        explanationOnCorrect: "In order to get the constant on the right side, we have to undo the left side.",
      });

      const cancel2Distractors = dedupNumeric("0", [
        { text: `${2 * op2Abs}`, tag: "flipped_the_operation" },
        { text: `${op2Abs}`, tag: "forgot_to_apply_operation" },
      ]);
      steps.push({
        stepId: "cancel_constant",
        rowUpdates: [],
        prompt: `What is ${op2Abs} ${op2Sym} ${op2Abs}?`,
        choices: shuffle([
          { text: "0", isCorrect: true, misconceptionTag: null },
          { text: cancel2Distractors[0].text, isCorrect: false, misconceptionTag: cancel2Distractors[0].tag },
          { text: cancel2Distractors[1].text, isCorrect: false, misconceptionTag: cancel2Distractors[1].tag },
        ]),
        explanationOnCorrect: `The constants are opposites resulting in 0.`,
      });

      newRhs = bRight - bLeft;
      working = [...working];
      blankCol(working, leftConstCol);
      setCol(
        working,
        rightConstCol,
        rightConstCol === rightOffset ? renderConstant(newRhs) : renderConstant(newRhs, true)
      );

      const combine2Distractors = dedupNumeric(`${newRhs}`, [
        { text: `${op2Sym === "-" ? bRight + op2Abs : bRight - op2Abs}`, tag: "flipped_the_operation" },
        { text: `${-newRhs}`, tag: "sign_error" },
        { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
      ]);
      steps.push({
        stepId: "combine_constant",
        rowUpdates: [{ slotId: "after_const_elim", row: { cells: working } }],
        prompt: `What is ${bRight} ${op2Sym} ${op2Abs}?`,
        choices: shuffle([
          { text: `${newRhs}`, isCorrect: true, misconceptionTag: null },
          { text: combine2Distractors[0].text, isCorrect: false, misconceptionTag: combine2Distractors[0].tag },
          { text: combine2Distractors[1].text, isCorrect: false, misconceptionTag: combine2Distractors[1].tag },
        ]),
        explanationOnCorrect: `The terms combine to ${newRhs}. The rest of the equation gets brought down unchanged.`,
      });

      divideSlotId = "after_const_elim";
    }

    const divSetup = `\\dfrac{${renderMultiplyTerm(newA, x)}}{${newA}}`;
    const divRhs = `\\dfrac{${newRhs}}{${newA}}`;
    working = [...working];
    setCol(working, leftXCol, divSetup);
    setCol(working, rightConstCol, divRhs);
    steps.push({
      stepId: "eliminate_coefficient",
      rowUpdates: [{ slotId: divideSlotId, row: { cells: working } }],
      prompt: `What undoes multiplying ${x} by ${newA}?`,
      choices: (() => {
        const collision = Math.abs(bLeft) === newA;
        return shuffle(
          collision
            ? [
                { text: `Dividing both sides by ${newA}`, isCorrect: true, misconceptionTag: null },
                {
                  text: `Multiplying both sides by ${newA}`,
                  isCorrect: false,
                  misconceptionTag: "confuses_additive_and_multiplicative_inverse",
                },
                {
                  text: `Adding ${Math.abs(newA)} to both sides`,
                  isCorrect: false,
                  misconceptionTag: "confuses_additive_and_multiplicative_inverse",
                },
              ]
            : [
                { text: `Dividing both sides by ${newA}`, isCorrect: true, misconceptionTag: null },
                {
                  text: `Multiplying both sides by ${newA}`,
                  isCorrect: false,
                  misconceptionTag: "confuses_additive_and_multiplicative_inverse",
                },
                {
                  text: `Dividing both sides by ${Math.abs(bLeft)}`,
                  isCorrect: false,
                  misconceptionTag: "targets_wrong_term_first",
                },
              ]
        );
      })(),
      explanationOnCorrect: `The coefficient ${newA} cancels when you divide both sides by ${newA}.`,
    });

    // Confirming the coefficient is 1 reveals a NEW, partial line: only
    // the isolated variable, nothing else - the still-pending other side
    // isn't repeated here a second time (it already appears once, on the
    // permanent fraction-setup line above).
    const coeffConfirmedRow = partialRow({ col: leftXCol, value: x });
    const coeffOneDistractors1 = dedupNumeric("1", [
      { text: `${newA}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-newA}`, tag: "sign_error" },
    ]);
    steps.push({
      stepId: "confirm_coefficient_one",
      // NEW slot, distinct from divideSlotId: the fraction-setup line
      // (e.g. "12x/12 = -84/12") stays on screen as its own permanent
      // line, and this becomes a new line below it, rather than
      // overwriting the fraction the moment the coefficient resolves.
      rowUpdates: [{ slotId: "coefficient_confirmed", row: { cells: coeffConfirmedRow } }],
      prompt: `What is ${newA} \u00f7 ${newA}?`,
      choices: shuffle([
        { text: "1", isCorrect: true, misconceptionTag: null },
        { text: coeffOneDistractors1[0].text, isCorrect: false, misconceptionTag: coeffOneDistractors1[0].tag },
        { text: coeffOneDistractors1[1].text, isCorrect: false, misconceptionTag: coeffOneDistractors1[1].tag },
      ]),
      explanationOnCorrect: `The coefficient ${newA} divided by itself is 1, so the variable is isolated.`,
    });

    const sameSign = newRhs >= 0 === newA >= 0;
    const finalDistractors = dedupNumeric(`${x} = ${solution}`, [
      { text: `${x} = ${-solution}`, tag: "sign_error" },
      { text: `${x} = ${newRhs}`, tag: "forgot_final_operation" },
      { text: `${x} = ${solution + 1}`, tag: "arithmetic_slip" },
      { text: `${x} = ${solution - 1}`, tag: "arithmetic_slip" },
    ]);
    steps.push({
      stepId: "compute_value",
      // Same slot as confirm_coefficient_one - this fills in the answer
      // on the SAME line that already showed the isolated variable,
      // rather than starting yet another new line.
      rowUpdates: [
        {
          slotId: "coefficient_confirmed",
          row: {
            cells: partialRow({ col: leftXCol, value: x }, { col: rightConstCol, value: renderConstant(solution) }),
            highlight: "success",
          },
        },
      ],
      prompt: `${newRhs} \u00f7 ${newA} = ? What is the value of ${x}?`,
      choices: shuffle([
        { text: `${x} = ${solution}`, isCorrect: true, misconceptionTag: null },
        { text: finalDistractors[0].text, isCorrect: false, misconceptionTag: finalDistractors[0].tag },
        { text: finalDistractors[1].text, isCorrect: false, misconceptionTag: finalDistractors[1].tag },
      ]),
      explanationOnCorrect: sameSign
        ? `The quotient ${newRhs} \u00f7 ${newA} = ${solution}. Same signs give a positive result.`
        : `The quotient ${newRhs} \u00f7 ${newA} = ${solution}. Different signs give a negative result.`,
    });
  } else {
    // ---------- Case B: the variable only ever appears on one side ----------
    const varOnLeft = aLeft !== 0;
    const coef = varOnLeft ? aLeft : aRight;
    const varCol = varOnLeft ? leftXCol : rightXCol;
    const bOnVarSide = varOnLeft ? bLeft : bRight;
    const constColOnVarSide = varOnLeft ? leftConstCol : rightConstCol;
    const rhsValue = varOnLeft ? bRight : bLeft;
    const rhsCol = varOnLeft ? rightConstCol : leftConstCol;

    let newRhs = rhsValue;
    const divideSlotId = "isolated";

    if (bOnVarSide !== 0) {
      const absB = Math.abs(bOnVarSide);
      const opSym = bOnVarSide >= 0 ? "-" : "+";
      const bPositive = bOnVarSide >= 0;

      const cancelDisplay1 = renderConstant(-bOnVarSide, true, !isLeadingCol(constColOnVarSide));
      const cancelDisplay2 = renderConstant(-bOnVarSide, true, !isLeadingCol(rhsCol));
      const cancelRow = minimalRow({ col: constColOnVarSide, value: cancelDisplay1 }, { col: rhsCol, value: cancelDisplay2 });

      steps.push({
        stepId: "goal_eliminate_constant",
        rowUpdates: [{ slotId: "cancel_const_annotation", row: { cells: cancelRow } }],
        prompt: `What undoes ${plainSignedConst(bOnVarSide)} on the side with the variable?`,
        choices: shuffle([
          {
            text: bPositive ? `Subtracting ${absB} from both sides` : `Adding ${absB} to both sides`,
            isCorrect: true,
            misconceptionTag: null,
          },
          {
            text: `${bPositive ? "Dividing" : "Multiplying"} both sides by ${absB}`,
            isCorrect: false,
            misconceptionTag: "confuses_additive_and_multiplicative_inverse",
          },
          {
            text: bPositive ? `Adding ${absB} to both sides` : `Subtracting ${absB} from both sides`,
            isCorrect: false,
            misconceptionTag: "flipped_the_operation",
          },
        ]),
        explanationOnCorrect: "In order to isolate the variable term, we have to undo the constant.",
      });

      const cancelDistractors = dedupNumeric("0", [
        { text: `${2 * absB}`, tag: "flipped_the_operation" },
        { text: `${absB}`, tag: "forgot_to_apply_operation" },
      ]);
      steps.push({
        stepId: "cancel_constant",
        rowUpdates: [],
        prompt: `What is ${bOnVarSide} ${opSym} ${absB}?`,
        choices: shuffle([
          { text: "0", isCorrect: true, misconceptionTag: null },
          { text: cancelDistractors[0].text, isCorrect: false, misconceptionTag: cancelDistractors[0].tag },
          { text: cancelDistractors[1].text, isCorrect: false, misconceptionTag: cancelDistractors[1].tag },
        ]),
        explanationOnCorrect: "The constants are opposites resulting in 0.",
      });

      newRhs = rhsValue - bOnVarSide;
      working = [...working];
      blankCol(working, constColOnVarSide);
      const rhsColIsCol0 = rhsCol === (varOnLeft ? rightOffset : 0);
      setCol(working, rhsCol, rhsColIsCol0 ? renderConstant(newRhs) : renderConstant(newRhs, true));

      const combineDistractors = dedupNumeric(`${newRhs}`, [
        { text: `${opSym === "-" ? rhsValue + absB : rhsValue - absB}`, tag: "flipped_the_operation" },
        { text: `${-newRhs}`, tag: "sign_error" },
        { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
      ]);
      steps.push({
        stepId: "combine_constant",
        rowUpdates: [{ slotId: "isolated", row: { cells: working } }],
        prompt: `What is ${rhsValue} ${opSym} ${absB}?`,
        choices: shuffle([
          { text: `${newRhs}`, isCorrect: true, misconceptionTag: null },
          { text: combineDistractors[0].text, isCorrect: false, misconceptionTag: combineDistractors[0].tag },
          { text: combineDistractors[1].text, isCorrect: false, misconceptionTag: combineDistractors[1].tag },
        ]),
        explanationOnCorrect: `The terms combine to ${newRhs}. The rest of the equation gets brought down unchanged.`,
      });
    }

    const divSetup = `\\dfrac{${renderMultiplyTerm(coef, x)}}{${coef}}`;
    const divRhs = `\\dfrac{${newRhs}}{${coef}}`;
    working = [...working];
    setCol(working, varCol, divSetup);
    setCol(working, rhsCol, divRhs);
    steps.push({
      stepId: "eliminate_coefficient",
      rowUpdates: [{ slotId: divideSlotId, row: { cells: working } }],
      prompt: `What undoes multiplying ${x} by ${coef}?`,
      choices: shuffle([
        { text: `Dividing both sides by ${coef}`, isCorrect: true, misconceptionTag: null },
        {
          text: `Multiplying both sides by ${coef}`,
          isCorrect: false,
          misconceptionTag: "confuses_additive_and_multiplicative_inverse",
        },
        {
          text: `Adding ${Math.abs(coef)} to both sides`,
          isCorrect: false,
          misconceptionTag: "confuses_additive_and_multiplicative_inverse",
        },
      ]),
      explanationOnCorrect: `The coefficient ${coef} cancels when you divide both sides by ${coef}.`,
    });

    // Confirming the coefficient is 1 reveals a NEW, partial line: only
    // the isolated variable, nothing else.
    const coeffConfirmedRow = partialRow({ col: varCol, value: x });
    const coeffOneDistractors2 = dedupNumeric("1", [
      { text: `${coef}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-coef}`, tag: "sign_error" },
    ]);
    steps.push({
      stepId: "confirm_coefficient_one",
      rowUpdates: [{ slotId: "coefficient_confirmed", row: { cells: coeffConfirmedRow } }],
      prompt: `What is ${coef} \u00f7 ${coef}?`,
      choices: shuffle([
        { text: "1", isCorrect: true, misconceptionTag: null },
        { text: coeffOneDistractors2[0].text, isCorrect: false, misconceptionTag: coeffOneDistractors2[0].tag },
        { text: coeffOneDistractors2[1].text, isCorrect: false, misconceptionTag: coeffOneDistractors2[1].tag },
      ]),
      explanationOnCorrect: `The coefficient ${coef} divided by itself is 1, so the variable is isolated.`,
    });

    const sameSign = newRhs >= 0 === coef >= 0;
    const finalDistractors = dedupNumeric(`${x} = ${solution}`, [
      { text: `${x} = ${-solution}`, tag: "sign_error" },
      { text: `${x} = ${newRhs}`, tag: "forgot_final_operation" },
      { text: `${x} = ${solution + 1}`, tag: "arithmetic_slip" },
      { text: `${x} = ${solution - 1}`, tag: "arithmetic_slip" },
    ]);
    steps.push({
      stepId: "compute_value",
      rowUpdates: [
        {
          slotId: "coefficient_confirmed",
          row: {
            cells: partialRow({ col: varCol, value: x }, { col: rhsCol, value: renderConstant(solution) }),
            highlight: "success",
          },
        },
      ],
      prompt: `${newRhs} \u00f7 ${coef} = ? What is the value of ${x}?`,
      choices: shuffle([
        { text: `${x} = ${solution}`, isCorrect: true, misconceptionTag: null },
        { text: finalDistractors[0].text, isCorrect: false, misconceptionTag: finalDistractors[0].tag },
        { text: finalDistractors[1].text, isCorrect: false, misconceptionTag: finalDistractors[1].tag },
      ]),
      explanationOnCorrect: sameSign
        ? `The quotient ${newRhs} \u00f7 ${coef} = ${solution}. Same signs give a positive result.`
        : `The quotient ${newRhs} \u00f7 ${coef} = ${solution}. Different signs give a negative result.`,
    });
  }

  return {
    initialRow,
    steps,
    eqColumnIndex: eqIndex,
    columnCount: leftCount + 1 + rightCount,
    // ~60/40 split - this skill can need noticeably more horizontal room
    // for the math side than the default 50/50 once a side has 3 terms.
    panelRatio: "3fr 2fr",
    termAlign: "right",
  };
}

export function generateMultiStepEquationsNoParenthesesInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
