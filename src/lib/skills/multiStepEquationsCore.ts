import type { SolverInstance, SolverStep, Choice, GridRow, DistributeVisual } from "./types";
import { assembleBothSides, randBool, randInt, renderConstant, renderMultiplyTerm, SIGN_GAP } from "./isolateVariableCore";
import { buildSolverInstance as buildVariablesBothSidesInstance } from "./variablesBothSides";

// ---------- shared small helpers ----------

export function plainTerm(coef: number, symbol: string): string {
  if (coef === 1) return symbol;
  if (coef === -1) return `-${symbol}`;
  return `${coef}${symbol}`;
}

export function shuffle<T>(arr: T[]): T[] {
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

// Random factor (magnitude 2-9, random sign) of `target`, or null if no
// such factor divides it evenly. Used to pick a distributable coefficient
// that produces a clean integer split.
function pickFactor(target: number): number | null {
  const abs = Math.abs(target);
  const candidates: number[] = [];
  for (let f = 2; f <= 9; f++) {
    if (abs % f === 0) candidates.push(f);
  }
  if (candidates.length === 0) return null;
  const mag = candidates[randInt(0, candidates.length - 1)];
  return mag * (randBool() ? 1 : -1);
}

// Same idea, but the factor must divide BOTH a and b evenly (needed when
// distributing produces both the coefficient AND the constant from the
// same outside multiplier).
function pickCommonFactor(a: number, b: number): number | null {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const candidates: number[] = [];
  for (let f = 2; f <= 9; f++) {
    if (absA % f === 0 && absB % f === 0) candidates.push(f);
  }
  if (candidates.length === 0) return null;
  const mag = candidates[randInt(0, candidates.length - 1)];
  return mag * (randBool() ? 1 : -1);
}

// ---------- per-side shape ----------

export type Shape = "SIMPLE" | "PAREN" | "COMBINE_VAR" | "COMBINE_CONST" | "PAREN_PLUS_VAR" | "PAREN_PLUS_CONST";

export interface SideSpec {
  shape: Shape;
  finalCoef: number;
  finalConst: number;
  m?: number;
  n?: number;
  p?: number;
  k?: number;
  a1?: number;
  a2?: number;
  b1?: number;
  b2?: number;
}

const shapeAttempts: Record<Exclude<Shape, "SIMPLE">, (finalCoef: number, finalConst: number) => SideSpec | null> = {
  PAREN: (finalCoef, finalConst) => {
    const m = pickCommonFactor(finalCoef, finalConst);
    if (m === null) return null;
    const n = finalCoef / m;
    const p = finalConst / m;
    if (n === 0) return null;
    return { shape: "PAREN", finalCoef, finalConst, m, n, p };
  },
  PAREN_PLUS_VAR: (finalCoef, finalConst) => {
    const m = pickFactor(finalConst);
    if (m === null) return null;
    const p = finalConst / m;
    const n = randInt(1, 4) * (randBool() ? 1 : -1);
    const k = finalCoef - m * n;
    if (k === 0) return null;
    return { shape: "PAREN_PLUS_VAR", finalCoef, finalConst, m, n, p, k };
  },
  PAREN_PLUS_CONST: (finalCoef, finalConst) => {
    const m = pickFactor(finalCoef);
    if (m === null) return null;
    const n = finalCoef / m;
    const p = randInt(1, 12) * (randBool() ? 1 : -1);
    const k = finalConst - m * p;
    if (k === 0) return null;
    return { shape: "PAREN_PLUS_CONST", finalCoef, finalConst, m, n, p, k };
  },
  COMBINE_VAR: (finalCoef, finalConst) => {
    const a1 = randInt(2, 9) * (randBool() ? 1 : -1);
    const a2 = finalCoef - a1;
    if (a2 === 0) return null;
    return { shape: "COMBINE_VAR", finalCoef, finalConst, a1, a2 };
  },
  COMBINE_CONST: (finalCoef, finalConst) => {
    let b1 = randInt(-15, 15);
    while (b1 === 0) b1 = randInt(-15, 15);
    const b2 = finalConst - b1;
    if (b2 === 0) return null;
    return { shape: "COMBINE_CONST", finalCoef, finalConst, b1, b2 };
  },
};

// `shapePool` is the set of non-SIMPLE shapes this call site is allowed to
// attempt - e.g. the no-parentheses skill only ever passes
// ["COMBINE_VAR", "COMBINE_CONST"], so PAREN-family shapes never appear
// there regardless of what values happen to factor cleanly.
// `skipSimpleShortcut` bypasses the usual 40%-stay-simple variety roll -
// for callers that need a guaranteed non-SIMPLE result (e.g. forcing at
// least one side to use parentheses), since otherwise this function can
// still return SIMPLE on every one of a caller's retries purely from that
// roll, regardless of how many times they call it.
export function buildSideSpec(
  finalCoef: number,
  finalConst: number,
  shapePool: Exclude<Shape, "SIMPLE">[],
  skipSimpleShortcut: boolean = false
): SideSpec {
  // 40% of the time, keep this side already-simplified for variety - not
  // every side of every problem needs to be maximally hard.
  if (!skipSimpleShortcut && Math.random() < 0.4) {
    return { shape: "SIMPLE", finalCoef, finalConst };
  }

  for (const shape of shuffle(shapePool)) {
    for (let tries = 0; tries < 5; tries++) {
      const result = shapeAttempts[shape](finalCoef, finalConst);
      if (result) return result;
    }
  }
  return { shape: "SIMPLE", finalCoef, finalConst };
}

export function needsDistribute(shape: Shape): boolean {
  return shape === "PAREN" || shape === "PAREN_PLUS_VAR" || shape === "PAREN_PLUS_CONST";
}
export function needsCombine(shape: Shape): boolean {
  return shape === "COMBINE_VAR" || shape === "COMBINE_CONST" || shape === "PAREN_PLUS_VAR" || shape === "PAREN_PLUS_CONST";
}

// ---------- reusable distribute/combine step builders ----------

function buildDistributeStep1(m: number, n: number, x: string, sideLabel: string) {
  const nxNatural = renderMultiplyTerm(n, x);
  const mnxNatural = renderMultiplyTerm(m * n, x);
  const choices: Choice[] = shuffle([
    { text: `$${mnxNatural}$`, isCorrect: true, misconceptionTag: null },
    { text: `$${renderMultiplyTerm(-(m * n), x)}$`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `$${nxNatural}$`, isCorrect: false, misconceptionTag: "forgot_outside_coefficient" },
  ]);
  return {
    resultCell: mnxNatural,
    prompt: `Distribute on the ${sideLabel} side. What is $${m} \\times ${nxNatural}$?`,
    choices,
    explanation: `$${m} \\times ${nxNatural} = ${mnxNatural}$.`,
  };
}

function buildDistributeStep2(m: number, p: number, sideLabel: string) {
  const mp = m * p;
  const pSigned = renderConstant(p, true);
  const mpSigned = renderConstant(mp, true);
  const choices: Choice[] = shuffle([
    { text: `$${mpSigned}$`, isCorrect: true, misconceptionTag: null },
    { text: `$${renderConstant(-mp, true)}$`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `$${pSigned}$`, isCorrect: false, misconceptionTag: "forgot_to_distribute_second_term" },
  ]);
  return {
    mp,
    mpSigned,
    prompt: `Distribute on the ${sideLabel} side. What is $${m} \\times ${p}$?`,
    choices,
    explanation: `$${m} \\times ${p} = ${mp}$.`,
  };
}

function buildCombineVarStep(coef1: number, coef2: number, x: string, sideLabel: string) {
  const combined = coef1 + coef2;
  const op = coef2 >= 0 ? "+" : "-";
  const abs2 = Math.abs(coef2);
  const correct = plainTerm(combined, x);
  const distractors = dedupNumeric(correct, [
    { text: plainTerm(coef1 - coef2, x), tag: "flipped_the_operation" },
    { text: plainTerm(combined + 1, x), tag: "arithmetic_slip" },
    { text: plainTerm(-combined, x), tag: "sign_error" },
  ]);
  const choices: Choice[] = shuffle([
    { text: correct, isCorrect: true, misconceptionTag: null },
    { text: distractors[0].text, isCorrect: false, misconceptionTag: distractors[0].tag },
    { text: distractors[1].text, isCorrect: false, misconceptionTag: distractors[1].tag },
  ]);
  const explanationBase = `The terms combine to ${plainTerm(combined, x)}.`;
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${plainTerm(coef1, x)} ${op} ${abs2}${x}?`,
    choices,
    explanationBase,
    // Used when this side's own reveal isn't also bringing the whole
    // equation down - see explanationBase for the whole-equation case.
    explanation: `${explanationBase} The rest of the ${sideLabel} side of the equation gets brought down unchanged.`,
  };
}

function buildCombineConstStep(b1: number, b2: number, sideLabel: string) {
  const combined = b1 + b2;
  const op = b2 >= 0 ? "+" : "-";
  const abs2 = Math.abs(b2);
  const correct = `${combined}`;
  const distractors = dedupNumeric(correct, [
    { text: `${b1 - b2}`, tag: "flipped_the_operation" },
    { text: `${combined + 1}`, tag: "arithmetic_slip" },
    { text: `${-combined}`, tag: "sign_error" },
  ]);
  const choices: Choice[] = shuffle([
    { text: correct, isCorrect: true, misconceptionTag: null },
    { text: distractors[0].text, isCorrect: false, misconceptionTag: distractors[0].tag },
    { text: distractors[1].text, isCorrect: false, misconceptionTag: distractors[1].tag },
  ]);
  const explanationBase = `The constants combine to ${combined}.`;
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${b1} ${op} ${abs2}?`,
    choices,
    explanationBase,
    explanation: `${explanationBase} The rest of the ${sideLabel} side of the equation gets brought down unchanged.`,
  };
}

// ---------- shared equation-value generation ----------

export interface BaseEquationValues {
  aLeft: number;
  aRight: number;
  bLeft: number;
  bRight: number;
  solution: number;
}

export function generateBaseEquationValues(): BaseEquationValues {
  const aLeft = randInt(2, 9) * (randBool() ? 1 : -1);
  let aRight = randInt(2, 9) * (randBool() ? 1 : -1);
  while (aLeft === aRight) aRight = randInt(2, 9) * (randBool() ? 1 : -1);

  let bLeft = randInt(-20, 20);
  while (bLeft === 0) bLeft = randInt(-20, 20);

  let solution = randInt(-12, 12);
  while (solution === 0) solution = randInt(-12, 12);

  let bRight = (aLeft - aRight) * solution + bLeft;
  while (bRight === 0) {
    solution = randInt(-12, 12);
    while (solution === 0) solution = randInt(-12, 12);
    bRight = (aLeft - aRight) * solution + bLeft;
  }

  return { aLeft, aRight, bLeft, bRight, solution };
}

export interface EquationInstance extends BaseEquationValues {
  leftSpec: SideSpec;
  rightSpec: SideSpec;
}

// ---------- assembly ----------

export function buildSolverInstance(
  eq: EquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { aLeft, aRight, bLeft, bRight, solution, leftSpec, rightSpec } = eq;
  const x = variableSymbol;

  // Each side's two packed cells, in their PRE-simplification form. A
  // parenthetical group packs its "m(nx" / "p)" pieces the same way
  // parenthesesEquations.ts does; an extra term outside the parens (or a
  // second bare like term with no parens at all) is concatenated into
  // whichever of the two cells it visually sits next to. This keeps every
  // row in this instance at exactly the same 5-cell shape throughout -
  // required, since one shared grid spans every row in the problem.
  function initialCells(spec: SideSpec): [string, string] {
    switch (spec.shape) {
      case "SIMPLE":
        return [renderMultiplyTerm(spec.finalCoef, x), renderConstant(spec.finalConst, true)];
      case "PAREN": {
        const nxNatural = renderMultiplyTerm(spec.n!, x);
        return [`${spec.m}(${nxNatural}`, `${renderConstant(spec.p!, true)})`];
      }
      case "PAREN_PLUS_VAR": {
        const nxNatural = renderMultiplyTerm(spec.n!, x);
        const kxForced = renderMultiplyTerm(spec.k!, x, true);
        return [`${spec.m}(${nxNatural}`, `${renderConstant(spec.p!, true)})${SIGN_GAP}${kxForced}`];
      }
      case "PAREN_PLUS_CONST": {
        const nxNatural = renderMultiplyTerm(spec.n!, x);
        const kForced = renderConstant(spec.k!, true);
        return [`${spec.m}(${nxNatural}`, `${renderConstant(spec.p!, true)})${SIGN_GAP}${kForced}`];
      }
      case "COMBINE_VAR": {
        const a2Forced = renderMultiplyTerm(spec.a2!, x, true);
        return [renderMultiplyTerm(spec.a1!, x), `${a2Forced}${SIGN_GAP}${renderConstant(spec.finalConst, true)}`];
      }
      case "COMBINE_CONST": {
        return [
          renderMultiplyTerm(spec.finalCoef, x),
          `${renderConstant(spec.b1!, true)}${SIGN_GAP}${renderConstant(spec.b2!, true)}`,
        ];
      }
    }
  }

  const [leftInitial1, leftInitial2] = initialCells(leftSpec);
  const [rightInitial1, rightInitial2] = initialCells(rightSpec);

  const initialRow: GridRow = {
    cells: assembleBothSides(leftInitial1, leftInitial2, rightInitial1, rightInitial2),
  };

  let leftCell1 = leftInitial1;
  let leftCell2 = leftInitial2;
  let rightCell1 = rightInitial1;
  let rightCell2 = rightInitial2;
  const BLANK = "\\phantom{0}";

  const steps: SolverStep[] = [];

  const rightNeedsCombine = needsCombine(rightSpec.shape);
  const leftNeedsCombine = needsCombine(leftSpec.shape);
  const rightNeedsDistribute = needsDistribute(rightSpec.shape);
  const leftNeedsDistribute = needsDistribute(leftSpec.shape);

  // ---------- Phase 1: distribute left ----------
  // "distributed" is a SINGLE slot shared by both sides' distribute
  // steps - left always goes first (if it needs distributing at all),
  // so its own first term always starts this line fresh, showing only
  // itself. Its second term brings the RIGHT side's current state along
  // too - but only when right doesn't have its own distribute phase
  // still to come (isLeftLastDistribute): if right ALSO needs
  // distributing, right hasn't reached its own turn yet, so it stays
  // hidden here and joins later, when ITS OWN distribute phase runs.
  const isLeftLastDistribute = leftNeedsDistribute && !rightNeedsDistribute;
  if (leftNeedsDistribute) {
    const s1 = buildDistributeStep1(leftSpec.m!, leftSpec.n!, x, "left");
    // Attaches to "__initial__" (row 0), not "distributed" - the arc
    // belongs on the permanent, unchanging problem statement, with the
    // progressive reveal living on its own separate new line below it.
    const distributeVisualLeft: DistributeVisual = {
      coefficient: `${leftSpec.m}`,
      term1: renderMultiplyTerm(leftSpec.n!, x),
      term2: renderConstant(leftSpec.p!, true),
      targetSlotId: "__initial__",
      firstTermStepId: "distribute_left_first_term",
      secondTermStepId: "distribute_left_second_term",
      // PAREN_PLUS_VAR/PAREN_PLUS_CONST have an extra term sitting right
      // after the closing paren on row 0 - without suffix, the arc's
      // spanning cell would silently swallow it.
      ...(leftSpec.shape === "PAREN_PLUS_VAR"
        ? { suffix: renderMultiplyTerm(leftSpec.k!, x, true) }
        : leftSpec.shape === "PAREN_PLUS_CONST"
        ? { suffix: renderConstant(leftSpec.k!, true) }
        : {}),
    };
    steps.push({
      stepId: "distribute_left_first_term",
      rowUpdates: [
        {
          slotId: "distributed",
          // LEFTALIGN: forces this cell flush against the left edge of
          // its own column, regardless of how wide any other row sharing
          // that column ends up being.
          row: { cells: assembleBothSides(`LEFTALIGN:${s1.resultCell}`, BLANK, BLANK, BLANK) },
        },
      ],
      prompt: s1.prompt,
      choices: s1.choices,
      explanationOnCorrect: s1.explanation,
      distributeVisual: distributeVisualLeft,
    });
    leftCell1 = s1.resultCell;

    const s2 = buildDistributeStep2(leftSpec.m!, leftSpec.p!, "left");
    leftCell2 =
      leftSpec.shape === "PAREN"
        ? s2.mpSigned
        : leftSpec.shape === "PAREN_PLUS_VAR"
        ? `${s2.mpSigned}${SIGN_GAP}${renderMultiplyTerm(leftSpec.k!, x, true)}`
        : `${s2.mpSigned}${SIGN_GAP}${renderConstant(leftSpec.k!, true)}`;
    const cells = isLeftLastDistribute
      ? assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2)
      : assembleBothSides(leftCell1, leftCell2, BLANK, BLANK);
    steps.push({
      stepId: "distribute_left_second_term",
      rowUpdates: [{ slotId: "distributed", row: { cells } }],
      prompt: s2.prompt,
      choices: s2.choices,
      // isLeftLastDistribute: right never needs distributing either, so
      // this brings the WHOLE equation down. Otherwise, right still has
      // its own distribute phase ahead of it - only the rest of LEFT's
      // own side is what's actually being brought down here.
      explanationOnCorrect: isLeftLastDistribute
        ? `${s2.explanation} The rest of the equation gets brought down unchanged.`
        : `${s2.explanation} The rest of the left side of the equation gets brought down unchanged.`,
      distributeVisual: distributeVisualLeft,
    });
  }

  // ---------- Phase 2: distribute right ----------
  if (rightNeedsDistribute) {
    const s1 = buildDistributeStep1(rightSpec.m!, rightSpec.n!, x, "right");
    const distributeVisualRight: DistributeVisual = {
      coefficient: `${rightSpec.m}`,
      term1: renderMultiplyTerm(rightSpec.n!, x),
      term2: renderConstant(rightSpec.p!, true),
      targetSlotId: "__initial__",
      firstTermStepId: "distribute_right_first_term",
      secondTermStepId: "distribute_right_second_term",
      termCols: [3, 4],
      ...(rightSpec.shape === "PAREN_PLUS_VAR"
        ? { suffix: renderMultiplyTerm(rightSpec.k!, x, true) }
        : rightSpec.shape === "PAREN_PLUS_CONST"
        ? { suffix: renderConstant(rightSpec.k!, true) }
        : {}),
    };
    // Evolves the SAME "distributed" slot left may have already started
    // Evolves the SAME "distributed" slot left may have already started
    // - but only IF left actually had its own distribute phase run
    // first. If left never needed distributing at all, this is actually
    // the very FIRST distribute step of the whole sequence (there was
    // no distribute_left phase to precede it), so it needs the exact
    // same treatment distribute_left_first_term gets when it's first:
    // only its own term, everything else blank - not left's content,
    // which was never actually established on this line to begin with.
    steps.push({
      stepId: "distribute_right_first_term",
      rowUpdates: [
        {
          slotId: "distributed",
          row: leftNeedsDistribute
            ? { cells: assembleBothSides(leftCell1, leftCell2, `LEFTALIGN:${s1.resultCell}`, BLANK) }
            : { cells: assembleBothSides(BLANK, BLANK, `LEFTALIGN:${s1.resultCell}`, BLANK) },
        },
      ],
      prompt: s1.prompt,
      choices: s1.choices,
      explanationOnCorrect: s1.explanation,
      distributeVisual: distributeVisualRight,
    });
    rightCell1 = s1.resultCell;

    const s2 = buildDistributeStep2(rightSpec.m!, rightSpec.p!, "right");
    rightCell2 =
      rightSpec.shape === "PAREN"
        ? s2.mpSigned
        : rightSpec.shape === "PAREN_PLUS_VAR"
        ? `${s2.mpSigned}${SIGN_GAP}${renderMultiplyTerm(rightSpec.k!, x, true)}`
        : `${s2.mpSigned}${SIGN_GAP}${renderConstant(rightSpec.k!, true)}`;
    // Right's distribute phase, when it exists, is always the last
    // distribute phase overall (left always goes first) - but whether
    // it shows left too depends on left's own situation: if left already
    // went through its own distribute phase, its content is already
    // established here and stays visible regardless of what's still
    // ahead for it. If left never distributed at all, showing it here
    // now depends on whether it has ANY processing left to do: if left
    // is genuinely done (simple shape, nothing left at all), it belongs
    // here since there's nothing left to wait for - but if left still
    // has its own combine step coming up, it hasn't been addressed yet
    // and stays hidden until THAT step runs instead.
    // Right's distribute phase, when it exists, is always the last
    // distribute phase overall (left always goes first) - once it's
    // done, ALL distribution work anywhere in the equation is complete
    // (confirmed: this always brings down the complete equation, even
    // if a side still has its own combine step left to go - combine
    // gets its own separate line later, starting fresh from here).
    steps.push({
      stepId: "distribute_right_second_term",
      rowUpdates: [
        {
          slotId: "distributed",
          row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) },
        },
      ],
      prompt: s2.prompt,
      choices: s2.choices,
      explanationOnCorrect: `${s2.explanation} The rest of the equation gets brought down unchanged.`,
      distributeVisual: distributeVisualRight,
    });
  }

  // ---------- Phase 3: combine left ----------
  // "combined" is a SEPARATE slot from "distributed" - a genuinely new
  // line, not a continuation of the distribute phase's own line (even
  // though the distribute phase may have already shown the right side's
  // raw state there). combine_left starts this new line fresh, showing
  // ONLY its own side - unless right doesn't need combining at all, in
  // which case this is also the overall last phase, so it shows the
  // complete equation directly instead.
  const isLeftLastCombine = leftNeedsCombine && !rightNeedsCombine;
  if (leftNeedsCombine) {
    let c: { combined: number; prompt: string; choices: Choice[]; explanation: string; explanationBase: string };
    if (leftSpec.shape === "COMBINE_VAR") {
      c = buildCombineVarStep(leftSpec.a1!, leftSpec.a2!, x, "left");
      leftCell1 = plainTerm(c.combined, x);
      leftCell2 = renderConstant(leftSpec.finalConst, true);
    } else if (leftSpec.shape === "COMBINE_CONST") {
      c = buildCombineConstStep(leftSpec.b1!, leftSpec.b2!, "left");
      leftCell2 = renderConstant(c.combined, true);
    } else if (leftSpec.shape === "PAREN_PLUS_VAR") {
      const mn = leftSpec.m! * leftSpec.n!;
      c = buildCombineVarStep(mn, leftSpec.k!, x, "left");
      leftCell1 = plainTerm(c.combined, x);
      leftCell2 = renderConstant(leftSpec.m! * leftSpec.p!, true);
    } else {
      const mp = leftSpec.m! * leftSpec.p!;
      c = buildCombineConstStep(mp, leftSpec.k!, "left");
      leftCell2 = renderConstant(c.combined, true);
    }
    const cells = isLeftLastCombine
      ? assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2)
      : assembleBothSides(leftCell1, leftCell2, BLANK, BLANK);
    steps.push({
      stepId: "combine_left",
      rowUpdates: [{ slotId: "combined", row: { cells } }],
      prompt: c.prompt,
      choices: c.choices,
      explanationOnCorrect: isLeftLastCombine
        ? `${c.explanationBase} The rest of the equation gets brought down unchanged.`
        : c.explanation,
    });
  }

  // ---------- Phase 4: combine right ----------
  if (rightNeedsCombine) {
    let c: { combined: number; prompt: string; choices: Choice[]; explanation: string; explanationBase: string };
    if (rightSpec.shape === "COMBINE_VAR") {
      c = buildCombineVarStep(rightSpec.a1!, rightSpec.a2!, x, "right");
      rightCell1 = plainTerm(c.combined, x);
      rightCell2 = renderConstant(rightSpec.finalConst, true);
    } else if (rightSpec.shape === "COMBINE_CONST") {
      c = buildCombineConstStep(rightSpec.b1!, rightSpec.b2!, "right");
      rightCell2 = renderConstant(c.combined, true);
    } else if (rightSpec.shape === "PAREN_PLUS_VAR") {
      const mn = rightSpec.m! * rightSpec.n!;
      c = buildCombineVarStep(mn, rightSpec.k!, x, "right");
      rightCell1 = plainTerm(c.combined, x);
      rightCell2 = renderConstant(rightSpec.m! * rightSpec.p!, true);
    } else {
      const mp = rightSpec.m! * rightSpec.p!;
      c = buildCombineConstStep(mp, rightSpec.k!, "right");
      rightCell2 = renderConstant(c.combined, true);
    }
    // Evolves the SAME "combined" slot combine_left may have already
    // started (or creates it fresh, if left never needed combining) -
    // right's own combine phase, when it exists, is always the last one
    // overall, so it always shows the complete equation.
    steps.push({
      stepId: "combine_right",
      rowUpdates: [
        { slotId: "combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } },
      ],
      prompt: c.prompt,
      choices: c.choices,
      explanationOnCorrect: `${c.explanationBase} The rest of the equation gets brought down unchanged.`,
    });
  }

  // ---------- Phase 5-6: isolate variable left, isolate constant right ----------
  // At this point leftCell1/leftCell2/rightCell1/rightCell2 exactly match
  // what variablesBothSides.ts's own initialRow would render for
  // (aLeft, bLeft, aRight, bRight) - same renderMultiplyTerm/renderConstant
  // calls with the same forceSign flags - so its steps can just continue
  // from here with no visual discontinuity, even though they were built
  // for a much simpler starting equation.
  //
  // "__initial__" here still holds the PRE-distribute, original row -
  // the actually-visible current row instead lives in "combined" (if
  // either side needed combining) or "distributed" (if only
  // distributing happened, no combining) or "__initial__" itself (if
  // neither happened at all). variablesBothSides.ts's own
  // cancel_variable_term step needs to mark THAT slot, not always
  // "__initial__" - same fix already made for twoStepEquations.ts's
  // delegation to parenthesesEquations.ts.
  const currentSlotId = leftNeedsCombine || rightNeedsCombine
    ? "combined"
    : leftNeedsDistribute || rightNeedsDistribute
    ? "distributed"
    : "__initial__";
  const vbs = buildVariablesBothSidesInstance({ aLeft, aRight, bLeft, bRight, solution }, x, currentSlotId);
  steps.push(...vbs.steps);

  return {
    initialRow,
    steps,
    eqColumnIndex: 2,
    columnCount: 5,
    // ~60/40 split - a parenthetical group on the left can otherwise get
    // cut off, same reasoning as the no-parentheses skill.
    panelRatio: "3fr 2fr",
    termAlign: "right",
  };
}
