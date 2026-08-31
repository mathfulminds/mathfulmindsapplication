import type { SolverInstance, SolverStep, Choice, PairedGridRow, GridRow } from "./types";
import { assembleRow, BLANK, randBool, randInt, randSign, renderConstant, renderMultiplyTerm, shuffle, SIGN_GAP } from "./isolateVariableCore";
import { buildOneStepInstance } from "./oneStepEquations";
import { buildSolverInstance as buildTwoStepInstance } from "./twoStepEquations";

type Scope = "direct" | "scaleOne" | "scaleBoth";
type Variable = "x" | "y";

// a1 x + b1 y = c1
// a2 x + b2 y = d2
interface EliminationInstance {
  a1: number;
  b1: number;
  c1: number;
  a2: number;
  b2: number;
  d2: number;
  eliminateVar: Variable;
  m1: number; // multiplier for equation 1 (always positive)
  m2: number; // multiplier for equation 2 (always positive)
  operation: "add" | "subtract";
  x0: number;
  y0: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Minimal positive (m1, m2) such that |m1*coef1| = |m2*coef2| (their LCM).
// Whether that requires ADD or SUBTRACT to cancel falls out of coef1/coef2's
// original signs (not chosen separately) - see the sameSign derivation
// below.
function computeMultipliers(coef1: number, coef2: number): { m1: number; m2: number } {
  const g = gcd(coef1, coef2);
  const lcm = Math.abs(coef1 * coef2) / g;
  return { m1: lcm / Math.abs(coef1), m2: lcm / Math.abs(coef2) };
}

// Tier 0 = neither equation needs scaling (coefficients already match).
// Tier 1 = only one equation needs scaling. Tier 2 = both need scaling.
// `work` is the largest multiplier actually required - the tiebreaker
// used WITHIN a tied tier, since two variables can both be "tier 1" while
// one only needs a x3 and the other needs a x6 (a real case that the
// old tier-only comparison didn't distinguish, letting the harder one
// get picked as "easier" as long as it wasn't in a strictly worse tier).
function tierAndWork(coefA: number, coefB: number): { tier: 0 | 1 | 2; work: number } {
  if (Math.abs(coefA) === Math.abs(coefB)) return { tier: 0, work: 1 };
  const { m1, m2 } = computeMultipliers(coefA, coefB);
  const tier = m1 === 1 || m2 === 1 ? 1 : 2;
  return { tier, work: Math.max(m1, m2) };
}

// True if `a` requires strictly less work than `b`: a lower tier always
// wins; within the same tier, the smaller multiplier wins.
function isStrictlyEasier(a: { tier: number; work: number }, b: { tier: number; work: number }): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier;
  return a.work < b.work;
}

function generateScopeCoeffs(scope: Scope): { p: number; q: number } {
  if (scope === "direct") {
    const base = randInt(2, 6);
    const p = base * randSign();
    const q = randBool() ? p : -p;
    return { p, q };
  }
  if (scope === "scaleOne") {
    const m2choice = [2, 3, 4][randInt(0, 2)];
    const j = randInt(2, 6);
    const p = m2choice * j * randSign();
    const q = j * randSign();
    return { p, q };
  }
  // scaleBoth - coprime multiplier pairs so both equations genuinely need scaling
  const pairs: [number, number][] = [
    [2, 3],
    [3, 2],
    [2, 5],
    [5, 2],
    [3, 4],
    [4, 3],
    [2, 7],
    [3, 5],
    [5, 3],
    [4, 5],
    [5, 4],
  ];
  const [pm, qm] = pairs[randInt(0, pairs.length - 1)];
  const j = randInt(2, 4);
  const p = qm * j * randSign();
  const q = pm * j * randSign();
  return { p, q };
}

export function generateElimination(forcedScope?: Scope): EliminationInstance {
  for (let attempt = 0; attempt < 60; attempt++) {
    const scope: Scope = forcedScope ?? (["direct", "scaleOne", "scaleBoth"] as const)[randInt(0, 2)];
    const eliminateVar: Variable = randBool() ? "x" : "y";
    const { p, q } = generateScopeCoeffs(scope);
    const { m1, m2 } = computeMultipliers(p, q);
    const sameSign = Math.sign(p) === Math.sign(q);
    const operation: "add" | "subtract" = sameSign ? "subtract" : "add";

    let otherA = randInt(1, 9) * randSign();
    let otherB = randInt(1, 9) * randSign();
    while (otherA === 0) otherA = randInt(1, 9) * randSign();
    while (otherB === 0) otherB = randInt(1, 9) * randSign();

    const targetInfo = tierAndWork(p, q);
    const otherInfo = tierAndWork(otherA, otherB);
    if (isStrictlyEasier(otherInfo, targetInfo)) continue; // the other variable is genuinely easier - retry

    let a1: number, b1: number, a2: number, b2: number;
    if (eliminateVar === "x") {
      a1 = p;
      a2 = q;
      b1 = otherA;
      b2 = otherB;
    } else {
      b1 = p;
      b2 = q;
      a1 = otherA;
      a2 = otherB;
    }

    // Guard against a degenerate (dependent) system: after scaling and
    // combining, the REMAINING variable's coefficient must be nonzero,
    // or the two equations are multiples of each other and elimination
    // doesn't produce a solvable single-variable equation.
    const sA1 = m1 * a1,
      sB1 = m1 * b1,
      sA2 = m2 * a2,
      sB2 = m2 * b2;
    const combA = operation === "add" ? sA1 + sA2 : sA1 - sA2;
    const combB = operation === "add" ? sB1 + sB2 : sB1 - sB2;
    const remainingCoef = eliminateVar === "x" ? combB : combA;
    if (remainingCoef === 0) continue;

    let x0 = randInt(-10, 10);
    while (x0 === 0) x0 = randInt(-10, 10);
    let y0 = randInt(-10, 10);
    while (y0 === 0) y0 = randInt(-10, 10);

    const c1 = a1 * x0 + b1 * y0;
    const d2 = a2 * x0 + b2 * y0;

    return { a1, b1, c1, a2, b2, d2, eliminateVar, m1, m2, operation, x0, y0 };
  }
  // Extremely unlikely fallback (60 retries should never actually exhaust).
  return {
    a1: 1,
    b1: 1,
    c1: 5,
    a2: 1,
    b2: -1,
    d2: 1,
    eliminateVar: "y",
    m1: 1,
    m2: 1,
    operation: "add",
    x0: 3,
    y0: 2,
  };
}

function equationRow(a: number, b: number, rhs: number): [string, string, string, string] {
  return assembleRow(renderMultiplyTerm(a, "x"), renderMultiplyTerm(b, "y", true), renderConstant(rhs), "expressionLeft", "=");
}

// Picks up to `count` distinct-from-correct, distinct-from-each-other
// candidates from a pool, in order, filling in generic fallbacks if the
// pool runs short after dedup. Reused across every MCQ in this file -
// several are only possible collisions in edge cases (e.g. multiplier=1,
// or a combined term evaluating to exactly 0), so every choice set here
// goes through this rather than being hand-assembled.
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
    const text = `${correct}~${fallbackOffset}`; // never collides; only reached in pathological cases
    out.push({ text, tag: "arithmetic_slip" });
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

function multiplierChoices(correct: number, alt: number): Choice[] {
  const correctText = `${correct}`;
  return buildChoices(correctText, [
    { text: `1`, tag: "used_wrong_multiplier" },
    { text: `${alt}`, tag: "used_wrong_multiplier" },
    { text: `${correct + 1}`, tag: "arithmetic_slip" },
    { text: `${Math.max(1, correct - 1)}`, tag: "arithmetic_slip" },
    { text: `${correct + 2}`, tag: "arithmetic_slip" },
  ]);
}

function finalAnswerChoices(x0: number, y0: number): Choice[] {
  return buildChoices(`$(${x0}, ${y0})$`, [
    { text: `$(${y0}, ${x0})$`, tag: "swapped_x_and_y" },
    { text: `$(${-x0}, ${-y0})$`, tag: "sign_error" },
    { text: `$(${x0 + 1}, ${y0})$`, tag: "arithmetic_slip" },
    { text: `$(${x0}, ${y0 + 1})$`, tag: "arithmetic_slip" },
    { text: `$(${x0 - 1}, ${y0 - 1})$`, tag: "arithmetic_slip" },
  ]);
}

// A term's display text when used as a standalone MCQ answer (not
// appended after another term, so no forced leading sign) - "0" reads
// far more naturally than "0x" when a term has fully cancelled out.
// Wrapped in KaTeX delimiters like every other variable-containing
// choice in this file, so it renders as italic math rather than plain
// text.
function termAnswerText(coef: number, symbol: string): string {
  return coef === 0 ? "$0$" : `$${renderMultiplyTerm(coef, symbol)}$`;
}

export function buildEliminationSolverInstance(inst: EliminationInstance): SolverInstance {
  const { a1, b1, c1, a2, b2, d2, eliminateVar, m1, m2, operation, x0, y0 } = inst;

  const eq1Row = equationRow(a1, b1, c1);
  const eq2Row = equationRow(a2, b2, d2);
  const initialRow: PairedGridRow = { eq1: eq1Row, eq2: eq2Row };

  // --- Step 1: choose which variable to eliminate ---
  const chooseVariable: SolverStep = {
    stepId: "choose_variable",
    rowUpdates: [],
    prompt: "Which variable is easier to eliminate here?",
    choices: shuffle([
      {
        text: "$x$",
        isCorrect: eliminateVar === "x",
        misconceptionTag: eliminateVar === "x" ? null : "chose_harder_variable_to_eliminate",
      },
      {
        text: "$y$",
        isCorrect: eliminateVar === "y",
        misconceptionTag: eliminateVar === "y" ? null : "chose_harder_variable_to_eliminate",
      },
    ]),
    explanationOnCorrect: `Eliminating ${eliminateVar} takes the least work here.`,
  };

  // --- Steps 2-9: scale each equation, one term at a time ---
  // The multiplier annotation now lives PERMANENTLY on the original
  // __initial__ row (updated once, at the "choose multiplier" step, then
  // never touched again for that equation) instead of appearing
  // transiently on the "scale" row and disappearing once terms are
  // computed. The two-term side gets an arrow diagram (same mechanism as
  // the parentheses/distribution skill, now generalized to work
  // per-equation) pointing from the multiplier to each term as it's
  // computed; the rhs side just gets the multiplier colored blue via an
  // inline KaTeX \textcolor command (\color alone would leak the color to
  // everything after it in the same group - \textcolor scopes it to just
  // its argument, confirmed with a real render before using it here).
  const BLUE_HEX = "#3f6fa8";

  // The permanent annotated form: "(m)(ax" / "+by)" / "c(m)" - same
  // column-split alignment technique the parentheses skill uses, so
  // these two columns are where the arrow diagram's spanning cell lands.
  // The x/y term cell VALUES here are only ever a fallback - the arrow
  // diagram entirely replaces their rendering once distributeVisual is
  // active for this equation, but they're still populated with the
  // natural (unscaled) terms so the shape is sensible even if not.
  function annotatedRow(m: number, a: number, b: number, c: number): [string, string, string, string] {
    const term1 = `(${m})(${renderMultiplyTerm(a, "x")}`;
    const term2 = `${renderMultiplyTerm(b, "y", true)})`;
    const rhs = `${c}(\\textcolor{${BLUE_HEX}}{${m}})`;
    return assembleRow(term1, term2, rhs, "expressionLeft", "=");
  }

  function buildScaleSteps(
    eqNum: 1 | 2,
    m: number,
    mAlt: number,
    a: number,
    b: number,
    c: number,
    otherInitialRow: [string, string, string, string], // other equation's CURRENT permanent __initial__ content
    otherScaleRow: [string, string, string, string], // other equation's current content for the "scale" slot
    otherEqDone: boolean, // whether the other equation is already fully scaled (for "scale" slot highlight)
    thisEqIsFirst: boolean,
    slotId: string
  ): { steps: SolverStep[]; annotatedInitialRow: [string, string, string, string] } {
    const thisAnnotated = annotatedRow(m, a, b, c);

    const chooseStep: SolverStep = {
      stepId: `multiply_eq${eqNum}_choose`,
      rowUpdates: [
        {
          slotId: "__initial__",
          row: {
            eq1: thisEqIsFirst ? thisAnnotated : otherInitialRow,
            eq2: thisEqIsFirst ? otherInitialRow : thisAnnotated,
          },
        },
      ],
      prompt: `What should you multiply Equation ${eqNum} by to eliminate ${eliminateVar}?`,
      choices: multiplierChoices(m, mAlt),
      explanationOnCorrect:
        m === 1
          ? `The Equation ${eqNum} already has a matching ${eliminateVar} coefficient, so no scaling is needed, but multiplying both sides by 1 keeps the equation balanced.`
          : `Multiplying both sides of Equation ${eqNum} by ${m} will make its ${eliminateVar} coefficient match the other equation's.`,
      distributeVisual: {
        coefficient: `(\\textcolor{${BLUE_HEX}}{${m}})`,
        term1: renderMultiplyTerm(a, "x"),
        term2: renderMultiplyTerm(b, "y", true),
        equation: eqNum === 1 ? "eq1" : "eq2",
        chooseStepId: `multiply_eq${eqNum}_choose`,
        firstTermStepId: `multiply_eq${eqNum}_xterm`,
        secondTermStepId: `multiply_eq${eqNum}_yterm`,
      },
    };

    // The "scale" row shows the progressive term-by-term computation,
    // starting blank and filling in - same pattern as the "combine" row
    // later in this file, now that the multiplier annotation itself
    // lives on __initial__ instead of here. During THIS equation's own
    // phase, if the other equation hasn't started scaling at all yet,
    // the row shows only this equation - not a paired row with the
    // other one sitting there unchanged, which would misleadingly
    // suggest it had already been touched. Once the other equation is
    // done, the row becomes a real pair again.
    const scaleRowAt = (xDone: boolean, yDone: boolean, rDone: boolean): GridRow | PairedGridRow => {
      const xCell = xDone ? renderMultiplyTerm(m * a, "x") : BLANK;
      const yCell = yDone ? renderMultiplyTerm(m * b, "y", true) : BLANK;
      const rhsCell = rDone ? renderConstant(m * c) : BLANK;
      const thisEq = assembleRow(xCell, yCell, rhsCell, "expressionLeft", "=");
      if (!otherEqDone) {
        return { cells: thisEq, highlight: "phase-blue" };
      }
      return {
        eq1: thisEqIsFirst ? thisEq : otherScaleRow,
        eq2: thisEqIsFirst ? otherScaleRow : thisEq,
        eq1Highlight: "phase-blue",
        eq2Highlight: "phase-blue",
      };
    };

    const xNatural = renderMultiplyTerm(a, "x");
    const xComputed = renderMultiplyTerm(m * a, "x");
    const xStep: SolverStep = {
      stepId: `multiply_eq${eqNum}_xterm`,
      rowUpdates: [{ slotId, row: scaleRowAt(true, false, false) }],
      prompt: `What is $${m} \\times ${xNatural}$?`,
      choices: buildChoices(`$${xComputed}$`, [
        { text: `$${renderMultiplyTerm(-m * a, "x")}$`, tag: "sign_error" },
        { text: `$${xNatural}$`, tag: "forgot_to_multiply_term" },
        { text: `$${renderMultiplyTerm(m * a + 1, "x")}$`, tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `$${m} \\times ${xNatural} = ${xComputed}$.`,
    };

    const yNatural = renderMultiplyTerm(b, "y");
    const yComputed = renderMultiplyTerm(m * b, "y");
    const yStep: SolverStep = {
      stepId: `multiply_eq${eqNum}_yterm`,
      rowUpdates: [{ slotId, row: scaleRowAt(true, true, false) }],
      prompt: `What is $${m} \\times ${yNatural}$?`,
      choices: buildChoices(`$${yComputed}$`, [
        { text: `$${renderMultiplyTerm(-m * b, "y")}$`, tag: "sign_error" },
        { text: `$${yNatural}$`, tag: "forgot_to_multiply_term" },
        { text: `$${renderMultiplyTerm(m * b + 1, "y")}$`, tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `$${m} \\times ${yNatural} = ${yComputed}$.`,
    };

    const rhsComputed = m * c;
    const rhsStep: SolverStep = {
      stepId: `multiply_eq${eqNum}_rhs`,
      rowUpdates: [{ slotId, row: scaleRowAt(true, true, true) }],
      prompt: `What is $${m} \\times ${c}$?`,
      choices: buildChoices(`${rhsComputed}`, [
        { text: `${-rhsComputed}`, tag: "sign_error" },
        { text: `${c}`, tag: "forgot_to_multiply_term" },
        { text: `${rhsComputed + 1}`, tag: "arithmetic_slip" },
      ]),
      explanationOnCorrect: `$${m} \\times ${c} = ${rhsComputed}$.`,
    };

    return { steps: [chooseStep, xStep, yStep, rhsStep], annotatedInitialRow: thisAnnotated };
  }

  const scaledEq1Final = equationRow(m1 * a1, m1 * b1, m1 * c1);
  const scaledEq2Final = equationRow(m2 * a2, m2 * b2, m2 * d2);

  const eq1Result = buildScaleSteps(1, m1, m2, a1, b1, c1, eq2Row, eq2Row, false, true, "scale");
  const eq2Result = buildScaleSteps(2, m2, m1, a2, b2, d2, eq1Result.annotatedInitialRow, scaledEq1Final, true, false, "scale");
  const eq1ScaleSteps = eq1Result.steps;
  const eq2ScaleSteps = eq2Result.steps;

  // --- Step 10: add or subtract ---
  const addOrSubtract: SolverStep = {
    stepId: "add_or_subtract",
    rowUpdates: [
      {
        slotId: "scale",
        row: { eq1: scaledEq1Final, eq2: scaledEq2Final, eq1Highlight: "phase-blue", eq2Highlight: "phase-blue" },
      },
    ],
    prompt: `Should we add or subtract the two equations to eliminate ${eliminateVar}?`,
    choices: shuffle([
      {
        text: "Add the equations",
        isCorrect: operation === "add",
        misconceptionTag: operation === "add" ? null : "wrong_add_subtract_choice",
      },
      {
        text: "Subtract the equations",
        isCorrect: operation === "subtract",
        misconceptionTag: operation === "subtract" ? null : "wrong_add_subtract_choice",
      },
    ]),
    explanationOnCorrect:
      operation === "add"
        ? `The ${eliminateVar} terms have opposite signs, so adding cancels them.`
        : `The ${eliminateVar} terms have the same sign, so subtracting cancels them.`,
  };

  // --- Steps 11-13: combine like terms, one column at a time ---
  const sA1 = m1 * a1,
    sB1 = m1 * b1,
    sC1 = m1 * c1;
  const sA2 = m2 * a2,
    sB2 = m2 * b2,
    sD2 = m2 * d2;
  const combA = operation === "add" ? sA1 + sA2 : sA1 - sA2;
  const combB = operation === "add" ? sB1 + sB2 : sB1 - sB2;
  const combRHS = operation === "add" ? sC1 + sD2 : sC1 - sD2;
  const opWord = operation === "add" ? "+" : "-";

  function combineRow(xDone: boolean, yDone: boolean, rDone: boolean): GridRow {
    const xTerm = xDone ? combA === 0 ? BLANK : renderMultiplyTerm(combA, "x") : BLANK;
    // Force the leading sign only when the x-term is actually visible -
    // once x is eliminated (blank), y becomes the first visible term on
    // the line and a forced "+" would read as if starting the line with
    // a stray plus sign.
    const yTerm = yDone ? (combB === 0 ? BLANK : renderMultiplyTerm(combB, "y", combA !== 0)) : BLANK;
    const rhs = rDone ? renderConstant(combRHS) : BLANK;
    return { cells: assembleRow(xTerm, yTerm, rhs, "expressionLeft", "="), highlight: "phase-blue" };
  }

  // The first term in "a OP b" never needs parens (its own sign is
  // already visually unambiguous at the start of an expression). The
  // second term only needs parens when it's negative - otherwise
  // "9x - 9x" would get wrapped into "9x - (9x)" for no reason, while
  // "7x - (-3x)" genuinely needs them to avoid an ambiguous double minus.
  function combinePromptTerm(coef: number, symbol: string, isSecond: boolean): string {
    const term = renderMultiplyTerm(coef, symbol);
    return isSecond && coef < 0 ? `(${term})` : term;
  }

  const combineXTerms: SolverStep = {
    stepId: "combine_xterms",
    rowUpdates: [{ slotId: "combine", row: combineRow(true, false, false) }],
    prompt: `What is $${combinePromptTerm(sA1, "x", false)} ${opWord} ${combinePromptTerm(sA2, "x", true)}$?`,
    choices: buildChoices(termAnswerText(combA, "x"), [
      { text: termAnswerText(-combA, "x"), tag: "sign_error" },
      { text: termAnswerText(operation === "add" ? sA1 - sA2 : sA1 + sA2, "x"), tag: "wrong_operation_choice" },
      { text: termAnswerText(combA + 1, "x"), tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${combinePromptTerm(sA1, "x", false)} ${opWord} ${combinePromptTerm(
      sA2,
      "x",
      true
    )}$ = ${termAnswerText(combA, "x")}.`,
  };

  const combineYTerms: SolverStep = {
    stepId: "combine_yterms",
    rowUpdates: [{ slotId: "combine", row: combineRow(true, true, false) }],
    prompt: `What is $${combinePromptTerm(sB1, "y", false)} ${opWord} ${combinePromptTerm(sB2, "y", true)}$?`,
    choices: buildChoices(termAnswerText(combB, "y"), [
      { text: termAnswerText(-combB, "y"), tag: "sign_error" },
      { text: termAnswerText(operation === "add" ? sB1 - sB2 : sB1 + sB2, "y"), tag: "wrong_operation_choice" },
      { text: termAnswerText(combB + 1, "y"), tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${combinePromptTerm(sB1, "y", false)} ${opWord} ${combinePromptTerm(
      sB2,
      "y",
      true
    )}$ = ${termAnswerText(combB, "y")}.`,
  };

  // The reused engines (oneStepEquations.ts, twoStepEquations.ts) always
  // place whatever variable they're solving for in column 0
  // (variableFirst:true, unconditionally). This skill's own rows
  // ("combine", the original equations) use a FIXED convention instead -
  // x always column 0, y always column 1 - so that a term's column never
  // depends on which variable happens to be involved. When the variable
  // being solved is y, the reused engine's rows need their first two
  // columns swapped to match, or y visibly jumps to a different column
  // than every other row uses for it.
  function swapCols01<T extends GridRow>(row: T): T {
    const [c0, c1, c2, c3] = row.cells;
    return { ...row, cells: [c1, c0, c2, c3] };
  }

  // Combined-equation solve (handoff #1): the combined equation is
  // always a plain one-step multiplicative equation - exactly what
  // oneStepEquations.ts already solves.
  const remainingVar: Variable = eliminateVar === "x" ? "y" : "x";
  const combinedCoef = remainingVar === "x" ? combA : combB;
  const combinedInstanceRaw = buildOneStepInstance(
    {
      variant: "multiplicative",
      a: combinedCoef,
      b: 0,
      form: "multiply",
      variableFirst: true,
      orientation: "expressionLeft",
      rhs: combRHS,
      solution: remainingVar === "x" ? x0 : y0,
    },
    remainingVar
  );
  const combinedInstance =
    remainingVar === "y"
      ? {
          ...combinedInstanceRaw,
          initialRow: swapCols01(combinedInstanceRaw.initialRow as GridRow),
          steps: combinedInstanceRaw.steps.map((step) => ({
            ...step,
            rowUpdates: step.rowUpdates.map((u) => ({ ...u, row: swapCols01(u.row as GridRow) })),
          })),
        }
      : combinedInstanceRaw;

  const combineRHS: SolverStep = {
    stepId: "combine_rhs",
    rowUpdates: [{ slotId: "combine", row: combineRow(true, true, true) }],
    prompt: `What is $${sC1} ${opWord} ${sD2 < 0 ? `(${sD2})` : sD2}$?`,
    choices: buildChoices(`${combRHS}`, [
      { text: `${-combRHS}`, tag: "sign_error" },
      { text: `${operation === "add" ? sC1 - sD2 : sC1 + sD2}`, tag: "wrong_operation_choice" },
      { text: `${combRHS + 1}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${sC1} ${opWord} ${sD2 < 0 ? `(${sD2})` : sD2} = ${combRHS}$. That leaves $${combinedCoef}${remainingVar} = ${combRHS}$.`,
  };

  // --- Steps 14-15: solve the combined equation (reused from oneStepEquations.ts) ---
  // oneStepEquations.ts hardcodes its own internal slotIds ("simplified",
  // "final"). Its "simplified" reveal (the division/fraction step) is
  // retargeted to the SAME "combine" slot used above, rather than a new
  // slot of its own - the combine row, once fully filled in, already
  // reads as exactly the equation this step starts from (e.g. "13y =
  // -104"), so continuing that same row in place straight into the
  // fraction form ("13y/13 = -104/13") avoids ever showing that
  // equation twice. "final" still gets its own row ("remaining_final"),
  // matching how every other solved-for-a-variable row in this skill
  // works. Without namespacing "final" this way, this solve's row and
  // the back-substitution solve's rows below would silently overwrite
  // each other in place instead of appearing as separate rows - a real
  // bug caught previously by inspecting the actual visible row
  // sequence, not just each step's answer correctness.
  //
  // Colored blue rather than left at normal color: blue runs all the
  // way through solving for the first variable, not just the
  // scaling/combining phase - green is reserved entirely for the
  // substitution phase that follows.
  const solveForRemainingSteps = combinedInstance.steps.map((step) => ({
    ...step,
    rowUpdates: step.rowUpdates.map((u) => ({
      ...u,
      slotId: u.slotId === "simplified" ? "combine" : `remaining_${u.slotId}`,
      row: "cells" in u.row ? { ...u.row, highlight: "phase-blue" as const } : u.row,
    })),
  }));

  // --- Step 16: choose which original equation to substitute into ---
  const knownVar = remainingVar;
  const knownValue = remainingVar === "x" ? x0 : y0;
  const unknownVar = eliminateVar;
  const unknownValue = eliminateVar === "x" ? x0 : y0;

  const knownCoefInEq1 = knownVar === "x" ? a1 : b1;
  const knownCoefInEq2 = knownVar === "x" ? a2 : b2;
  // "Better" = simpler arithmetic = smaller |coefficient of the known
  // variable| in that equation, since that's the number being multiplied
  // during substitution. Ties default to Equation 1.
  const substituteIntoEq: 1 | 2 = Math.abs(knownCoefInEq2) < Math.abs(knownCoefInEq1) ? 2 : 1;

  const chosenEquationRow: GridRow = {
    cells: substituteIntoEq === 1 ? equationRow(a1, b1, c1) : equationRow(a2, b2, d2),
    highlight: "phase-green",
  };

  // --- Step 17: substitute the known value in ---
  const subEqCoefUnknown = substituteIntoEq === 1 ? (unknownVar === "x" ? a1 : b1) : unknownVar === "x" ? a2 : b2;
  const subEqCoefKnown = substituteIntoEq === 1 ? knownCoefInEq1 : knownCoefInEq2;
  const subEqRHS = substituteIntoEq === 1 ? c1 : d2;
  const substitutedConstant = subEqCoefKnown * knownValue;

  // Handoff #2: once the known value is substituted in, the remaining
  // equation is exactly the two-step shape - reuse twoStepEquations.ts.
  // variableFirst is passed conditionally (not hardcoded true) so the
  // engine itself produces the correct column order - and correct
  // sign-forcing on whichever term ends up second - directly. A
  // hardcoded variableFirst:true followed by a blind column swap when
  // unknownVar is "y" was the earlier approach, but a swap can't
  // correctly re-sign a term after moving it - it either leaves a
  // forced "+" on what's now the first term, or leaves the new second
  // term without the forced sign it needs. Computing the right shape
  // from the start avoids needing any correction at all.
  const backSubInstance = buildTwoStepInstance(
    {
      a: subEqCoefUnknown,
      b: substitutedConstant,
      form: "multiply",
      variableFirst: unknownVar === "x",
      orientation: "expressionLeft",
      rhs: subEqRHS,
      solution: unknownValue,
    },
    unknownVar
  );

  // Pending substitution row: the KNOWN variable's term shows as a
  // literal "(coefficient)(value)" - not yet computed - while the
  // unknown's term and the rhs stay in their normal form. Unlike the
  // combine-steps' conditional parenthesization (parens only when
  // negative, to avoid an ambiguous double minus), a substituted value is
  // ALWAYS parenthesized regardless of sign - that's the convention for
  // "a variable just got replaced by a specific number," not for
  // combining two signed terms. The value itself is colored blue via an
  // inline KaTeX \textcolor, since this row is otherwise green (the
  // substitution phase's color) and the newly-inserted number should
  // stand out the same way the scaling phase's multiplier does.
  function substitutedTermDisplay(coef: number, value: number, forceSign: boolean): string {
    const valueStr = `(\\textcolor{${BLUE_HEX}}{${value}})`;
    const absCoef = Math.abs(coef);
    const core = absCoef === 1 ? valueStr : `${absCoef}${valueStr}`;
    if (!forceSign) return coef < 0 ? `-${core}` : core;
    const sign = coef >= 0 ? "+" : "-";
    return `${sign}${SIGN_GAP}${core}`;
  }

  // Fixed x-then-y column ordering, matching chosen_equation's own
  // convention - NOT "unknown first" (which would put y in column 0
  // whenever y happens to be the unknown, visibly clashing with every
  // other row in this skill that keeps x in column 0).
  const xTermDisplay =
    unknownVar === "x" ? renderMultiplyTerm(subEqCoefUnknown, "x") : substitutedTermDisplay(subEqCoefKnown, knownValue, false);
  const yTermDisplay =
    unknownVar === "y" ? renderMultiplyTerm(subEqCoefUnknown, "y", true) : substitutedTermDisplay(subEqCoefKnown, knownValue, true);

  const substitutionPendingRow: GridRow = {
    cells: assembleRow(xTermDisplay, yTermDisplay, renderConstant(subEqRHS), "expressionLeft", "="),
    highlight: "phase-green",
  };

  // Once the student correctly answers which equation is simpler, both
  // the chosen equation (restated as its own line) and the substituted
  // form appear together - a genuine step, not redundant, since it's
  // where the student sees which equation they picked before watching
  // the value get plugged into it.
  const chooseSubstituteEq: SolverStep = {
    stepId: "choose_substitute_equation",
    rowUpdates: [
      { slotId: "chosen_equation", row: chosenEquationRow },
      { slotId: "substituted", row: substitutionPendingRow },
    ],
    prompt: `We know $${knownVar} = ${knownValue}$. Which equation is simpler to substitute it into?`,
    choices: [
      {
        text: `Equation 1: $${a1}x ${renderMultiplyTerm(b1, "y", true)} = ${c1}$`,
        isCorrect: substituteIntoEq === 1,
        misconceptionTag: substituteIntoEq === 1 ? null : "chose_harder_equation_to_substitute_into",
      },
      {
        text: `Equation 2: $${a2}x ${renderMultiplyTerm(b2, "y", true)} = ${d2}$`,
        isCorrect: substituteIntoEq === 2,
        misconceptionTag: substituteIntoEq === 2 ? null : "chose_harder_equation_to_substitute_into",
      },
    ],
    explanationOnCorrect: `The Equation ${substituteIntoEq} has the simpler coefficient to work with.`,
  };

  const substituteStep: SolverStep = {
    stepId: "substitute",
    rowUpdates: [{ slotId: "substituted_simplified", row: { ...backSubInstance.initialRow, highlight: "phase-green" } }],
    prompt: `Substitute $${knownVar} = ${knownValue}$ into Equation ${substituteIntoEq}. What is $${subEqCoefKnown} \\times ${knownValue}$?`,
    choices: buildChoices(`${substitutedConstant}`, [
      { text: `${-substitutedConstant}`, tag: "sign_error" },
      { text: `${subEqCoefKnown + knownValue}`, tag: "arithmetic_slip" },
      { text: `${substitutedConstant + 1}`, tag: "arithmetic_slip" },
    ]),
    explanationOnCorrect: `$${subEqCoefKnown} \\times ${knownValue} = ${substitutedConstant}$.`,
  };

  // --- Steps 18-20: solve for the second variable (reused from twoStepEquations.ts), colored green ---
  const solveForUnknownSteps = backSubInstance.steps.map((step) => ({
    ...step,
    rowUpdates: step.rowUpdates.map((u) => ({
      ...u,
      slotId: `unknown_${u.slotId}`,
      row: "cells" in u.row ? { ...u.row, highlight: (u.row.highlight ?? "phase-green") as GridRow["highlight"] } : u.row,
    })),
  }));

  // --- Step 21: state the solution ---
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
      chooseVariable,
      ...eq1ScaleSteps,
      ...eq2ScaleSteps,
      addOrSubtract,
      combineXTerms,
      combineYTerms,
      combineRHS,
      ...solveForRemainingSteps,
      chooseSubstituteEq,
      substituteStep,
      ...solveForUnknownSteps,
      finalAnswer,
    ],
    eqColumnIndex: 2,
    termAlign: "right",
  };
}

export function generateEliminationInstance(forcedScope?: Scope): SolverInstance {
  const inst = generateElimination(forcedScope);
  return buildEliminationSolverInstance(inst);
}
