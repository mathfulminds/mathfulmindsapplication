import type { SolverInstance, SolverStep, Choice, PairedGridRow, GridRow } from "./types";
import { assembleRow, assembleRow3, BLANK, randBool, randInt, randSign, renderConstant, renderMultiplyTerm, shuffle } from "./isolateVariableCore";
import { buildSolverInstance as buildTwoStepInstance } from "./twoStepEquations";

// This skill uses 3 term columns (not the usual 2), since the expand
// phase genuinely needs 3 independent columns - a kept term, a
// distributed constant, and a distributed variable term - each staying
// in its own fixed column rather than any two of them being combined
// into one column's text. Every row in this skill is 5 cells for
// consistency (even ones that only ever use 2 real terms), since the
// vertical layout shares one single grid for the whole problem and
// every row in that shared grid needs the same cell count to align
// correctly.
function pad3(cells4: readonly [string, string, string, string]): [string, string, string, string, string] {
  return [cells4[0], cells4[1], BLANK, cells4[2], cells4[3]];
}

type Variable = "x" | "y";
type PhaseColor = "phase-blue" | "phase-red";
const BLUE_HEX = "#3f6fa8";
const RED_HEX = "#e2574c"; // matches the app's own --coral brand variable

// a1 x + b1 y = c1
// a2 x + b2 y = d2
interface SubstitutionInstance {
  a1: number;
  b1: number;
  c1: number;
  a2: number;
  b2: number;
  d2: number;
  isolateEq: 1 | 2; // which equation we isolate a variable in
  isolateVar: Variable; // which variable we isolate
  x0: number;
  y0: number;
}

// --- Generation ---
// Step 0 check: construct the problem so exactly ONE (equation, variable)
// pair has coefficient exactly +-1 - that pair is always the correct
// "easiest to isolate" answer, with no ambiguity, since every other
// coefficient is deliberately kept at magnitude >=2.
export function generateSubstitution(): SubstitutionInstance {
  for (let attempt = 0; attempt < 60; attempt++) {
    const isolateEq: 1 | 2 = randBool() ? 1 : 2;
    const isolateVar: Variable = randBool() ? "x" : "y";
    const isoCoef = randSign(); // always exactly +-1
    const otherCoefInIsolateEq = randInt(2, 9) * randSign();
    const otherA = randInt(2, 9) * randSign();
    const otherB = randInt(2, 9) * randSign();

    let a1: number, b1: number, a2: number, b2: number;
    if (isolateEq === 1 && isolateVar === "x") {
      a1 = isoCoef;
      b1 = otherCoefInIsolateEq;
      a2 = otherA;
      b2 = otherB;
    } else if (isolateEq === 1 && isolateVar === "y") {
      b1 = isoCoef;
      a1 = otherCoefInIsolateEq;
      a2 = otherA;
      b2 = otherB;
    } else if (isolateEq === 2 && isolateVar === "x") {
      a2 = isoCoef;
      b2 = otherCoefInIsolateEq;
      a1 = otherA;
      b1 = otherB;
    } else {
      b2 = isoCoef;
      a2 = otherCoefInIsolateEq;
      a1 = otherA;
      b1 = otherB;
    }

    // Degenerate (dependent) system guard - must have a unique solution.
    const det = a1 * b2 - a2 * b1;
    if (det === 0) continue;

    let x0 = randInt(-10, 10);
    while (x0 === 0) x0 = randInt(-10, 10);
    let y0 = randInt(-10, 10);
    while (y0 === 0) y0 = randInt(-10, 10);

    const c1 = a1 * x0 + b1 * y0;
    const d2 = a2 * x0 + b2 * y0;

    return { a1, b1, c1, a2, b2, d2, isolateEq, isolateVar, x0, y0 };
  }
  // Extremely unlikely fallback.
  return { a1: 1, b1: 3, c1: 7, a2: 2, b2: -1, d2: 3, isolateEq: 1, isolateVar: "x", x0: 1, y0: 2 };
}

function equationRow(a: number, b: number, rhs: number): [string, string, string, string, string] {
  return pad3(assembleRow(renderMultiplyTerm(a, "x"), renderMultiplyTerm(b, "y", true), renderConstant(rhs), "expressionLeft", "="));
}

function pickDistinctDistractors(correct: string, candidates: { text: string; tag: string }[], count: number): { text: string; tag: string }[] {
  const seen = new Set([correct]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === count) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  let fallbackOffset = 1;
  while (out.length < count) {
    out.push({ text: `${correct}~${fallbackOffset}`, tag: "arithmetic_slip" });
    fallbackOffset++;
  }
  return out;
}

function buildChoices(correctText: string, candidates: { text: string; tag: string }[]): Choice[] {
  const distractors = pickDistinctDistractors(correctText, candidates, 2);
  return shuffle([
    { text: correctText, isCorrect: true, misconceptionTag: null },
    { text: distractors[0].text, isCorrect: false, misconceptionTag: distractors[0].tag },
    { text: distractors[1].text, isCorrect: false, misconceptionTag: distractors[1].tag },
  ]);
}

function finalAnswerChoices(x0: number, y0: number): Choice[] {
  return buildChoices(`$(${x0}, ${y0})$`, [
    { text: `$(${y0}, ${x0})$`, tag: "swapped_x_and_y" },
    { text: `$(${-x0}, ${-y0})$`, tag: "sign_error" },
    { text: `$(${x0 + 1}, ${y0})$`, tag: "arithmetic_slip" },
    { text: `$(${x0}, ${y0 + 1})$`, tag: "arithmetic_slip" },
  ]);
}

// Represents "constant - (coef*symbol)" as readable text - used to show
// what's left after moving a term to the other side of the equation.
function subtractTermText(constant: number, coef: number, symbol: string): string {
  const opSign = coef >= 0 ? "-" : "+";
  const magText = renderMultiplyTerm(Math.abs(coef), symbol);
  return `${constant} ${opSign} ${magText}`;
}

export function buildSubstitutionSolverInstance(inst: SubstitutionInstance): SolverInstance {
  const { a1, b1, c1, a2, b2, d2, isolateEq, isolateVar, x0, y0 } = inst;

  // Equation 1 is always blue, Equation 2 is always red - fixed by
  // identity, not by role, so a student can track "which equation is
  // this" by color throughout the whole problem regardless of which one
  // ends up being isolated. isolateColor/otherColor are just convenience
  // lookups into that fixed assignment.
  const eq1Color: PhaseColor = "phase-blue";
  const eq2Color: PhaseColor = "phase-red";
  const isolateColor: PhaseColor = isolateEq === 1 ? eq1Color : eq2Color;
  const otherColor: PhaseColor = isolateEq === 1 ? eq2Color : eq1Color;
  const isolateHex = isolateEq === 1 ? BLUE_HEX : RED_HEX;
  const otherHex = isolateEq === 1 ? RED_HEX : BLUE_HEX;

  const eq1Row = equationRow(a1, b1, c1);
  const eq2Row = equationRow(a2, b2, d2);
  // Colored from the very start and never touched again - a constant
  // reference point for the whole problem, not something that changes.
  const initialRow: PairedGridRow = { eq1: eq1Row, eq2: eq2Row, eq1Highlight: eq1Color, eq2Highlight: eq2Color };

  const isoCoef = isolateEq === 1 ? (isolateVar === "x" ? a1 : b1) : isolateVar === "x" ? a2 : b2;
  const otherCoefInIsolateEq = isolateEq === 1 ? (isolateVar === "x" ? b1 : a1) : isolateVar === "x" ? b2 : a2;
  const isolateEqRHS = isolateEq === 1 ? c1 : d2;
  const remainingVar: Variable = isolateVar === "x" ? "y" : "x";

  // --- Step 1: choose which (equation, variable) to isolate ---
  const chooseIsolate: SolverStep = {
    stepId: "choose_isolate",
    rowUpdates: [],
    prompt: "Which variable is easiest to isolate?",
    // Fixed order (not shuffled) - x in Eq1, y in Eq1, x in Eq2, y in Eq2 -
    // so the choices are predictable to scan, not rearranged every time.
    choices: ([1, 2] as const).flatMap((eqNum) =>
      (["x", "y"] as const).map((v) => ({
        text: `${v} in Equation ${eqNum}`,
        isCorrect: eqNum === isolateEq && v === isolateVar,
        misconceptionTag: eqNum === isolateEq && v === isolateVar ? null : "chose_harder_variable_to_isolate",
      }))
    ),
    explanationOnCorrect: `The ${isolateVar} in Equation ${isolateEq} has a coefficient of ${isoCoef === 1 ? "1" : "-1"}, the simplest one to work with.`,
  };

  // --- Step 2a: move the other term to the other side ---
  // Shows the operation applied to BOTH sides first (the moving term
  // appearing under where it used to sit AND under the rhs), then the
  // simplified row - matching the cancel-annotation convention already
  // used in twoStepEquations.ts, rather than jumping straight to the
  // simplified result.
  const movingTermCoef = -otherCoefInIsolateEq; // the value being added/subtracted to cancel the original term
  const movingTermText = renderMultiplyTerm(movingTermCoef, remainingVar, true);
  const cancelRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(BLANK, movingTermText, movingTermText, "expressionLeft", ""))
        : pad3(assembleRow(movingTermText, BLANK, movingTermText, "expressionLeft", "")),
    highlight: isolateColor,
  };
  const movedRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(renderMultiplyTerm(isoCoef, "x"), BLANK, subtractTermText(isolateEqRHS, otherCoefInIsolateEq, "y"), "expressionLeft", "="))
        : pad3(assembleRow(BLANK, renderMultiplyTerm(isoCoef, "y"), subtractTermText(isolateEqRHS, otherCoefInIsolateEq, "x"), "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const moveDirection = otherCoefInIsolateEq >= 0 ? "Subtract" : "Add";
  const moveWord = otherCoefInIsolateEq >= 0 ? "from" : "to";
  const moveTermText = renderMultiplyTerm(Math.abs(otherCoefInIsolateEq), remainingVar);
  // The actual term as it appears in the equation, with its real sign -
  // used only in the prompt, which asks about a specific term that's
  // literally sitting there (e.g. "-3x"), not an abstract magnitude.
  const actualMoveTermText = renderMultiplyTerm(otherCoefInIsolateEq, remainingVar);
  const isolateMoveTerm: SolverStep = {
    stepId: "isolate_move_term",
    rowUpdates: [
      { slotId: "cancel", row: cancelRow },
      { slotId: "isolate", row: movedRow },
    ],
    prompt: `What operation removes $${actualMoveTermText}$ from the left side of Equation ${isolateEq}?`,
    choices: buildChoices(`${moveDirection}ing $${moveTermText}$ ${moveWord} both sides`, [
      { text: `${moveDirection === "Subtract" ? "Adding" : "Subtracting"} $${moveTermText}$ ${moveWord === "from" ? "to" : "from"} both sides`, tag: "flipped_the_operation" },
      { text: `Dividing both sides by $${Math.abs(otherCoefInIsolateEq)}$`, tag: "targets_wrong_term_first" },
    ]),
    explanationOnCorrect: `${moveDirection}ing $${moveTermText}$ ${moveWord.replace("to", "on")} both sides isolates the $${isolateVar}$-term.`,
  };

  // --- Step 2b: divide by the coefficient (always +-1, but always asked) ---
  // term1/term2 are the two pieces of the isolated expression - kept
  // separate (not just a combined string) because they're fed directly
  // into the distribute-arrow diagram used a few steps later.
  let isoTerm1: number; // constant part
  let isoTerm2Coef: number; // coefficient of remainingVar part
  if (isoCoef === 1) {
    isoTerm1 = isolateEqRHS;
    isoTerm2Coef = -otherCoefInIsolateEq;
  } else {
    // isoCoef === -1: negate everything
    isoTerm1 = -isolateEqRHS;
    isoTerm2Coef = otherCoefInIsolateEq;
  }
  const isolatedDisplay = `${isolateVar} = ${renderConstant(isoTerm1)} ${isoTerm2Coef >= 0 ? "+" : "-"} ${renderMultiplyTerm(Math.abs(isoTerm2Coef), remainingVar)}`;
  const isolatedRHSExpr = `${renderConstant(isoTerm1)} ${isoTerm2Coef >= 0 ? "+" : "-"} ${renderMultiplyTerm(Math.abs(isoTerm2Coef), remainingVar)}`;
  // Fraction-form annotation - shows the division actually applied to
  // both sides (matching twoStepEquations.ts's own "undo the
  // coefficient" convention). Written to the SAME slot as movedRow
  // above ("isolate"), not a new one - dividing by isoCoef here doesn't
  // introduce new information the way combining like terms does
  // elsewhere; it's the same equation, just now shown with the division
  // actually applied, so it updates the existing line rather than
  // adding a separate one below it.
  const divideAnnotationRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(`\\dfrac{${renderMultiplyTerm(isoCoef, "x")}}{${isoCoef}}`, BLANK, `\\dfrac{${subtractTermText(isolateEqRHS, otherCoefInIsolateEq, "y")}}{${isoCoef}}`, "expressionLeft", "="))
        : pad3(assembleRow(BLANK, `\\dfrac{${renderMultiplyTerm(isoCoef, "y")}}{${isoCoef}}`, `\\dfrac{${subtractTermText(isolateEqRHS, otherCoefInIsolateEq, "x")}}{${isoCoef}}`, "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const isolateDivide: SolverStep = {
    stepId: "isolate_divide",
    rowUpdates: [{ slotId: "isolate", row: divideAnnotationRow }],
    prompt: `What do we divide both sides by to isolate $${isolateVar}$?`,
    choices: buildChoices(`${isoCoef}`, [
      { text: `${-isoCoef}`, tag: "sign_error" },
      { text: `2`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect:
      isoCoef === 1
        ? "Dividing by 1 on both sides doesn't change the sign of the equation."
        : "Dividing by -1 on both sides changes the sign of each part of the equation.",
  };

  // --- Step 2c: simplify the fraction form - a genuine step, not revealed for free ---
  const isolatedFinalRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(isolateVar, BLANK, isolatedRHSExpr, "expressionLeft", "="))
        : pad3(assembleRow(BLANK, isolateVar, isolatedRHSExpr, "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const isolateCompute: SolverStep = {
    stepId: "isolate_compute",
    rowUpdates: [{ slotId: "isolate_final", row: isolatedFinalRow }],
    prompt: "What is the fully simplified equation?",
    choices: buildChoices(`$${isolatedDisplay}$`, [
      // Forgot to actually divide the right side through - this is
      // exactly the row BEFORE this step (the un-divided moved form).
      // Collides with the correct answer whenever isoCoef is 1 (dividing
      // by 1 changes nothing), which is exactly why a third, always-safe
      // candidate exists below - without it, that collision fell through
      // to buildChoices's placeholder fallback text instead of a real
      // distractor.
      { text: `$${isolateVar} = ${subtractTermText(isolateEqRHS, otherCoefInIsolateEq, remainingVar)}$`, tag: "forgot_final_operation" },
      // Flipped signs that shouldn't have flipped (meaningful even when
      // isoCoef is 1, where no flip was needed at all).
      { text: `$${isolateVar} = ${renderConstant(-isoTerm1)} ${isoTerm2Coef >= 0 ? "-" : "+"} ${renderMultiplyTerm(Math.abs(isoTerm2Coef), remainingVar)}$`, tag: "sign_error" },
      // Off-by-one on the constant - guaranteed to differ from the
      // correct answer regardless of isoCoef, unlike the first candidate.
      { text: `$${isolateVar} = ${renderConstant(isoTerm1 + 1)} ${isoTerm2Coef >= 0 ? "+" : "-"} ${renderMultiplyTerm(Math.abs(isoTerm2Coef), remainingVar)}$`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `Simplifying gives $${isolatedDisplay}$.`,
  };

  // --- Step 3: choose what to substitute, and into which equation ---
  const otherEqNum: 1 | 2 = isolateEq === 1 ? 2 : 1;
  const otherA = otherEqNum === 1 ? a1 : a2;
  const otherB = otherEqNum === 1 ? b1 : b2;
  const otherRHS = otherEqNum === 1 ? c1 : d2;
  // The coefficient in the OTHER equation that multiplies the variable we just isolated:
  const multiplierCoef = isolateVar === "x" ? otherA : otherB;
  const keptCoef = isolateVar === "x" ? otherB : otherA; // the other equation's coefficient for remainingVar, untouched

  const isoTerm1Text = renderConstant(isoTerm1);
  const isoTerm2Text = renderMultiplyTerm(isoTerm2Coef, remainingVar);
  // The arc diagram shows term1 and term2 side by side with only a small
  // visual gap between them (no literal "+" character) - that gap alone
  // reads fine when term2 is negative (its own "-" fills the gap), but
  // silently drops the sign entirely when term2 is positive, since
  // isoTerm2Text has no leading character at all in that case. Forced
  // here specifically for the arc; isoTerm2Text itself stays as-is since
  // its other use (substitutedCellColored, below) already inserts its
  // own "+" manually and forcing it here too would double it up.
  const isoTerm2TextForced = renderMultiplyTerm(isoTerm2Coef, remainingVar, true);
  // Colored to match the equation this expression came FROM (isolateColor),
  // even though the surrounding row belongs to the OTHER equation - the
  // same "trace where this came from" idea used throughout.
  const substitutedCellColored = `${multiplierCoef}(\\textcolor{${isolateHex}}{${isoTerm1Text}${isoTerm2Coef >= 0 ? "+" : ""}${isoTerm2Text}})`;

  const substitutedRow: GridRow = {
    cells:
      isolateVar === "x"
        ? assembleRow3(substitutedCellColored, BLANK, renderMultiplyTerm(keptCoef, "y", true), renderConstant(otherRHS), "=")
        : assembleRow3(renderMultiplyTerm(keptCoef, "x"), substitutedCellColored, BLANK, renderConstant(otherRHS), "="),
    highlight: otherColor,
  };

  const chooseSubstitute: SolverStep = {
    stepId: "choose_substitute",
    rowUpdates: [{ slotId: "substitute", row: substitutedRow }],
    prompt: `We know $${isolatedDisplay}$. What should we substitute this into?`,
    // Fixed chronological order (not shuffled) - Equation 1 before
    // Equation 2, x before y - so the choices are predictable to scan.
    // The one combination that isn't a real option here (substituting
    // back into the very equation we isolated from, using the same
    // variable) is naturally absent already; this just orders what's
    // left rather than reshuffling it.
    choices: [
      { eqNum: otherEqNum, varName: isolateVar, isCorrect: true, misconceptionTag: null },
      { eqNum: isolateEq, varName: isolateVar, isCorrect: false, misconceptionTag: "substituted_into_same_equation" },
      { eqNum: otherEqNum, varName: remainingVar, isCorrect: false, misconceptionTag: "substituted_wrong_variable" },
    ]
      .sort((a, b) => a.eqNum - b.eqNum || (a.varName === b.varName ? 0 : a.varName === "x" ? -1 : 1))
      .map((o) => ({ text: `Equation ${o.eqNum}, in place of $${o.varName}$`, isCorrect: o.isCorrect, misconceptionTag: o.misconceptionTag })),
    explanationOnCorrect: `Substituting into Equation ${otherEqNum} (not the equation we isolated from) gives one equation in a single variable.`,
  };

  // --- Steps 4-5: distribute the multiplier into the substituted expression, combining as we go ---
  const distributedConst = multiplierCoef * isoTerm1;
  const distributedVarCoef = multiplierCoef * isoTerm2Coef;
  const combinedVarCoef = keptCoef + distributedVarCoef;

  const keptTermNatural = renderMultiplyTerm(keptCoef, remainingVar);
  const keptTermForced = renderMultiplyTerm(keptCoef, remainingVar, true);
  const distConstNatural = renderConstant(distributedConst);
  const distConstForced = distributedConst >= 0 ? `+\\,${distributedConst}` : `${distributedConst}`;
  const distVarNatural = renderMultiplyTerm(distributedVarCoef, remainingVar);
  const distVarForced = renderMultiplyTerm(distributedVarCoef, remainingVar, true);
  const combinedForced = renderMultiplyTerm(combinedVarCoef, remainingVar, true);

  // Three genuinely separate columns - one per term - each landing in
  // its own fixed position that never changes once established, exactly
  // matching how every other skill in the app shows one term per column
  // rather than combining multiple terms into one column's text.
  //
  // isolateVar="x": substituted expression came first (columns 0-1 via
  // the arc), kept term last (column 2). Column 0 = distributed
  // constant, column 1 = distributed variable term, column 2 = kept
  // term.
  // isolateVar="y": kept term came first (column 0), substituted
  // expression last (columns 1-2 via the arc). Column 0 = kept term,
  // column 1 = distributed constant, column 2 = distributed variable
  // term.
  //
  // Whichever column holds the piece computed by THIS step is the only
  // one that changes; every other column either stays blank (not yet
  // reachable) or holds a value that was already known and never moves.
  const afterConstRow: GridRow = {
    cells:
      isolateVar === "x"
        ? assembleRow3(distConstNatural, BLANK, BLANK, BLANK, "")
        : assembleRow3(keptTermNatural, distConstForced, BLANK, BLANK, ""),
    highlight: otherColor,
  };
  const distributeConst: SolverStep = {
    stepId: "distribute_constant",
    rowUpdates: [{ slotId: "expand", row: afterConstRow }],
    prompt: `To clear the parentheses, we need to distribute the $${multiplierCoef}$. What is $${multiplierCoef} \\times ${isoTerm1}$?`,
    choices: buildChoices(`${distributedConst}`, [
      { text: `${-distributedConst}`, tag: "sign_error" },
      { text: `${isoTerm1}`, tag: "forgot_to_multiply_term" },
      // Both guaranteed distinct from distributedConst even when isoTerm1
      // is 0 - which collapses BOTH candidates above to 0 as well, since
      // distributedConst = multiplierCoef * isoTerm1 is then also 0.
      { text: `${distributedConst + multiplierCoef}`, tag: "arithmetic_slip" },
      { text: `${distributedConst - multiplierCoef}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${multiplierCoef} \\times ${isoTerm1} = ${distributedConst}$.`,
    distributeVisual: {
      coefficient: isolateVar === "y" ? (multiplierCoef >= 0 ? `\\textcolor{${otherHex}}{+\\,${multiplierCoef}}` : `\\textcolor{${otherHex}}{${multiplierCoef}}`) : `\\textcolor{${otherHex}}{${multiplierCoef}}`,
      term1: `\\textcolor{${isolateHex}}{${isoTerm1Text}}`,
      term2: `\\textcolor{${isolateHex}}{${isoTerm2TextForced}}`,
      targetSlotId: "substitute",
      chooseStepId: "choose_substitute",
      firstTermStepId: "distribute_constant",
      secondTermStepId: "distribute_variable",
      // The arc spans whichever two of the three columns actually hold
      // the substituted expression - the first two when it comes first
      // (isolateVar="x"), the last two when the kept term comes first
      // instead (isolateVar="y"). The kept term is its own genuine grid
      // cell now (not a prefix/suffix glued onto the arc), so it renders
      // through the normal cell path like any other term.
      termCols: isolateVar === "x" ? [0, 1] : [1, 2],
    },
  };

  // This is the first point where the entire left side is known, so
  // it's also the first reveal that shows "=rhs" - bringing the rest of
  // the equation down now that it's genuinely complete, rather than
  // asserting something false earlier. Every column already established
  // above stays exactly where it was; only the newly-computed column
  // changes.
  const distributedRow: GridRow = {
    cells:
      isolateVar === "x"
        ? assembleRow3(distConstNatural, distVarForced, keptTermForced, renderConstant(otherRHS), "=")
        : assembleRow3(keptTermNatural, distConstForced, distVarForced, renderConstant(otherRHS), "="),
    highlight: otherColor,
  };
  const distributeVariable: SolverStep = {
    stepId: "distribute_variable",
    rowUpdates: [{ slotId: "expand", row: distributedRow }],
    prompt: `To clear the parentheses, we need to distribute the $${multiplierCoef}$. What is $${multiplierCoef} \\times (${isoTerm2Text})$?`,
    choices: buildChoices(`$${renderMultiplyTerm(distributedVarCoef, remainingVar)}$`, [
      { text: `$${renderMultiplyTerm(-distributedVarCoef, remainingVar)}$`, tag: "sign_error" },
      { text: `$${renderMultiplyTerm(isoTerm2Coef, remainingVar)}$`, tag: "forgot_to_multiply_term" },
    ]),
    explanationOnCorrect: `$${multiplierCoef} \\times ${isoTerm2Text} = ${renderMultiplyTerm(
      distributedVarCoef,
      remainingVar
    )}$, and the rest of the equation's parts, $${keptTermNatural}$, $=$, and $${otherRHS}$, get brought down unchanged.`,
  };

  // Naming the two specific like terms explicitly before asking for
  // their sum, since a column sits between them (they're not adjacent
  // in the row above) - it isn't obvious just from reading left to
  // right which two pieces are meant to combine. Ordered to match
  // whichever term naturally comes first for this case.
  const likeTermsText =
    isolateVar === "y" ? `${keptTermNatural} ${distVarForced}` : `${distVarNatural} ${keptTermForced}`;
  // The combined term takes the position its first-appearing piece
  // already had - column 1 for isolateVar="x" (where the distributed
  // variable term was), column 0 for isolateVar="y" (where the kept
  // term was) - and the OTHER of the two like-term columns is now
  // absorbed into it, so it goes blank. The constant, uninvolved in this
  // combination, stays exactly where it already was.
  const finalExpandedRow: GridRow = {
    cells:
      isolateVar === "x"
        ? assembleRow3(distConstNatural, combinedForced, BLANK, renderConstant(otherRHS), "=")
        : assembleRow3(combinedVarCoef >= 0 ? renderMultiplyTerm(combinedVarCoef, remainingVar) : combinedForced, distConstForced, BLANK, renderConstant(otherRHS), "="),
    highlight: otherColor,
  };
  const combineTerms: SolverStep = {
    stepId: "combine_terms",
    rowUpdates: [{ slotId: "expand_combined", row: finalExpandedRow }],
    prompt:
      isolateVar === "y"
        ? `$${keptTermNatural}$ and $${renderMultiplyTerm(distributedVarCoef, remainingVar)}$ are like terms. What is $${likeTermsText}$?`
        : `$${renderMultiplyTerm(distributedVarCoef, remainingVar)}$ and $${keptTermNatural}$ are like terms. What is $${likeTermsText}$?`,
    choices: buildChoices(`$${renderMultiplyTerm(combinedVarCoef, remainingVar)}$`, [
      { text: `$${renderMultiplyTerm(-combinedVarCoef, remainingVar)}$`, tag: "sign_error" },
      { text: `$${renderMultiplyTerm(keptCoef - distributedVarCoef, remainingVar)}$`, tag: "wrong_operation_choice" },
    ]),
    explanationOnCorrect: `$${likeTermsText} = ${renderMultiplyTerm(combinedVarCoef, remainingVar)}$.`,
  };

  // --- Steps 6-8: solve the resulting two-step equation (reused from twoStepEquations.ts) ---
  const remainingValue = remainingVar === "x" ? x0 : y0;
  const twoStepRaw = buildTwoStepInstance(
    {
      a: combinedVarCoef,
      b: distributedConst,
      form: "multiply",
      variableFirst: isolateVar === "y",
      orientation: "expressionLeft",
      rhs: otherRHS,
      solution: remainingValue,
    },
    remainingVar
  );
  // No column swap needed here anymore - variableFirst above is now set
  // per isolateVar specifically so this reused engine's own column order
  // already matches finalExpandedRow's natural order for both cases.
  const twoStepInstance = twoStepRaw;

  const solveForRemainingSteps = twoStepInstance.steps.map((step) => ({
    ...step,
    rowUpdates: step.rowUpdates.map((u) => ({
      ...u,
      slotId: `solve_${u.slotId}`,
      row: "cells" in u.row ? { ...u.row, cells: pad3(u.row.cells as [string, string, string, string]), highlight: otherColor } : u.row,
    })),
  }));

  // --- Step 9: back-substitute into the isolated expression ---
  const isolatedValue = isolateVar === "x" ? x0 : y0;
  const backSubComputed = isoTerm2Coef * remainingValue;
  // The substituted VALUE is colored to match where it came from
  // (otherColor - it was solved via the other equation's work), while
  // the row itself is isolateColor, since we're back in isolateEq's
  // expression.
  const backSubExprPending = `${isoTerm1Text} ${isoTerm2Coef >= 0 ? "+" : "-"} ${Math.abs(isoTerm2Coef)}(\\textcolor{${otherHex}}{${remainingValue}})`;
  const backSubPendingRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(isolateVar, BLANK, backSubExprPending, "expressionLeft", "="))
        : pad3(assembleRow(BLANK, isolateVar, backSubExprPending, "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const chooseBackSubstitute: SolverStep = {
    stepId: "choose_back_substitute",
    // Reveals the pending substitution immediately, matching how
    // choosing the forward substitution equation already reveals that
    // row right away - the student sees the substitution actually
    // happen as soon as they identify where it belongs, not on some
    // later step.
    rowUpdates: [{ slotId: "back_substitute_pending", row: backSubPendingRow }],
    prompt: `We know $${remainingVar} = ${remainingValue}$. What should we substitute this into?`,
    choices: shuffle([
      { text: `The isolated equation ($${isolateVar} = ...$)`, isCorrect: true, misconceptionTag: null },
      { text: `Equation ${otherEqNum} (the one we just solved)`, isCorrect: false, misconceptionTag: "substituted_into_wrong_equation" },
      { text: `The original Equation ${isolateEq} (before isolating)`, isCorrect: false, misconceptionTag: "used_unsimplified_form" },
    ]),
    explanationOnCorrect: `Substituting into the isolated equation gives $${isolateVar}$ directly.`,
  };
  // Intermediate line showing the multiplication actually applied
  // (e.g. "x = 18 - 27"), as its own persistent row - not overwriting
  // the pending form above it, and not yet doing the final combine.
  const backSubIntermediateRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(isolateVar, BLANK, `${isoTerm1Text} ${backSubComputed >= 0 ? "+" : "-"} ${Math.abs(backSubComputed)}`, "expressionLeft", "="))
        : pad3(assembleRow(BLANK, isolateVar, `${isoTerm1Text} ${backSubComputed >= 0 ? "+" : "-"} ${Math.abs(backSubComputed)}`, "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const backSubStep: SolverStep = {
    stepId: "back_substitute",
    rowUpdates: [{ slotId: "back_substitute_computed", row: backSubIntermediateRow }],
    prompt: `We know $${remainingVar} = ${remainingValue}$. What is $${isoTerm2Coef} \\times ${remainingValue}$?`,
    choices: buildChoices(`${backSubComputed}`, [
      { text: `${-backSubComputed}`, tag: "sign_error" },
      { text: `${isoTerm2Coef + remainingValue}`, tag: "arithmetic_slip" },
      // Guaranteed distinct - covers the rare coincidence where
      // isoTerm2Coef + remainingValue happens to equal their product
      // (e.g. 2 + 2 = 2 x 2), which collides the candidate above with
      // the correct answer itself.
      { text: `${backSubComputed + 1}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${isoTerm2Coef} \\times ${remainingValue} = ${backSubComputed}$.`,
  };

  const backSubFinalRow: GridRow = {
    cells:
      isolateVar === "x"
        ? pad3(assembleRow(isolateVar, BLANK, `${isolatedValue}`, "expressionLeft", "="))
        : pad3(assembleRow(BLANK, isolateVar, `${isolatedValue}`, "expressionLeft", "=")),
    highlight: isolateColor,
  };
  const backSubComputeStep: SolverStep = {
    stepId: "back_substitute_compute",
    rowUpdates: [{ slotId: "back_substitute_final", row: backSubFinalRow }],
    prompt: `What is $${isoTerm1} ${backSubComputed >= 0 ? "+" : "-"} ${Math.abs(backSubComputed)}$?`,
    choices: buildChoices(`${isolateVar} = ${isolatedValue}`, [
      { text: `${isolateVar} = ${-isolatedValue}`, tag: "sign_error" },
      { text: `${isolateVar} = ${isoTerm1 - backSubComputed}`, tag: "wrong_operation_choice" },
      // Guaranteed distinct - when isoTerm1 is 0, the two candidates
      // above both reduce to -backSubComputed and collide with each
      // other.
      { text: `${isolateVar} = ${isolatedValue + 1}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${isoTerm1} ${backSubComputed >= 0 ? "+" : "-"} ${Math.abs(backSubComputed)} = ${isolatedValue}$.`,
  };

  // --- Step 10: final answer ---
  const finalAnswer: SolverStep = {
    stepId: "final_answer",
    rowUpdates: [],
    prompt: "What is the solution to the system?",
    choices: finalAnswerChoices(x0, y0),
    explanationOnCorrect: `The solution is $x = ${x0}$, $y = ${y0}$.`,
  };

  return {
    initialRow,
    steps: [
      chooseIsolate,
      isolateMoveTerm,
      isolateDivide,
      isolateCompute,
      chooseSubstitute,
      distributeConst,
      distributeVariable,
      combineTerms,
      ...solveForRemainingSteps,
      chooseBackSubstitute,
      backSubStep,
      backSubComputeStep,
      finalAnswer,
    ],
    eqColumnIndex: 3,
    termAlign: "right",
    // Now targets isolate_final (the last thing revealed before
    // substitute, once isolate_compute exists) instead of isolate - the
    // fraction-annotation row sits between "isolate" and "substitute" in
    // the visual order, which meant the old target made the arrow cut
    // straight through that row's text instead of connecting cleanly.
    rowConnectors: [{ fromSlotId: "isolate_final", toSlotId: "substitute" }],
  };
}

export function generateSubstitutionInstance(): SolverInstance {
  const inst = generateSubstitution();
  return buildSubstitutionSolverInstance(inst);
}
