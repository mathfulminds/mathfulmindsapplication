import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import { assembleBothSides, randBool, randInt, renderConstant, renderMultiplyTerm } from "./isolateVariableCore";
import { buildSolverInstance as buildVariablesBothSidesInstance } from "./variablesBothSides";

// ---------- shared small helpers ----------

function plainTerm(coef: number, symbol: string): string {
  if (coef === 1) return symbol;
  if (coef === -1) return `-${symbol}`;
  return `${coef}${symbol}`;
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

type Shape = "SIMPLE" | "PAREN" | "COMBINE_VAR" | "COMBINE_CONST" | "PAREN_PLUS_VAR" | "PAREN_PLUS_CONST";

interface SideSpec {
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

function buildSideSpec(finalCoef: number, finalConst: number): SideSpec {
  // 40% of the time, keep this side already-simplified for variety - not
  // every side of every problem needs to be maximally hard.
  if (Math.random() < 0.4) {
    return { shape: "SIMPLE", finalCoef, finalConst };
  }

  const attempts: (() => SideSpec | null)[] = [
    (): SideSpec | null => {
      const m = pickCommonFactor(finalCoef, finalConst);
      if (m === null) return null;
      const n = finalCoef / m;
      const p = finalConst / m;
      if (n === 0) return null;
      return { shape: "PAREN", finalCoef, finalConst, m, n, p };
    },
    (): SideSpec | null => {
      const m = pickFactor(finalConst);
      if (m === null) return null;
      const p = finalConst / m;
      const n = randInt(1, 4) * (randBool() ? 1 : -1);
      const k = finalCoef - m * n;
      if (k === 0) return null;
      return { shape: "PAREN_PLUS_VAR", finalCoef, finalConst, m, n, p, k };
    },
    (): SideSpec | null => {
      const m = pickFactor(finalCoef);
      if (m === null) return null;
      const n = finalCoef / m;
      const p = randInt(1, 12) * (randBool() ? 1 : -1);
      const k = finalConst - m * p;
      if (k === 0) return null;
      return { shape: "PAREN_PLUS_CONST", finalCoef, finalConst, m, n, p, k };
    },
    (): SideSpec | null => {
      const a1 = randInt(2, 9) * (randBool() ? 1 : -1);
      const a2 = finalCoef - a1;
      if (a2 === 0) return null;
      return { shape: "COMBINE_VAR", finalCoef, finalConst, a1, a2 };
    },
    (): SideSpec | null => {
      let b1 = randInt(-15, 15);
      while (b1 === 0) b1 = randInt(-15, 15);
      const b2 = finalConst - b1;
      if (b2 === 0) return null;
      return { shape: "COMBINE_CONST", finalCoef, finalConst, b1, b2 };
    },
  ];

  for (const attempt of shuffle(attempts)) {
    for (let tries = 0; tries < 5; tries++) {
      const result = attempt();
      if (result) return result;
    }
  }
  return { shape: "SIMPLE", finalCoef, finalConst };
}

function needsDistribute(shape: Shape): boolean {
  return shape === "PAREN" || shape === "PAREN_PLUS_VAR" || shape === "PAREN_PLUS_CONST";
}
function needsCombine(shape: Shape): boolean {
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
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${plainTerm(coef1, x)} ${op} ${abs2}${x}?`,
    choices,
    explanation: `The terms combine to ${plainTerm(combined, x)}. The rest of the equation gets brought down unchanged.`,
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
  return {
    combined,
    prompt: `Combine the like terms on the ${sideLabel} side. What is ${b1} ${op} ${abs2}?`,
    choices,
    explanation: `The constants combine to ${combined}. The rest of the equation gets brought down unchanged.`,
  };
}

// ---------- generation ----------

interface EquationInstance {
  aLeft: number;
  aRight: number;
  bLeft: number;
  bRight: number;
  solution: number;
  leftSpec: SideSpec;
  rightSpec: SideSpec;
}

export function generateEquation(): EquationInstance {
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

  const leftSpec = buildSideSpec(aLeft, bLeft);
  const rightSpec = buildSideSpec(aRight, bRight);

  return { aLeft, aRight, bLeft, bRight, solution, leftSpec, rightSpec };
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
        return [`${spec.m}(${nxNatural}`, `${renderConstant(spec.p!, true)}) ${kxForced}`];
      }
      case "PAREN_PLUS_CONST": {
        const nxNatural = renderMultiplyTerm(spec.n!, x);
        const kForced = renderConstant(spec.k!, true);
        return [`${spec.m}(${nxNatural}`, `${renderConstant(spec.p!, true)}) ${kForced}`];
      }
      case "COMBINE_VAR": {
        const a2Forced = renderMultiplyTerm(spec.a2!, x, true);
        return [renderMultiplyTerm(spec.a1!, x), `${a2Forced} ${renderConstant(spec.finalConst, true)}`];
      }
      case "COMBINE_CONST": {
        return [
          renderMultiplyTerm(spec.finalCoef, x),
          `${renderConstant(spec.b1!, true)} ${renderConstant(spec.b2!, true)}`,
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

  const steps: SolverStep[] = [];

  // ---------- Phase 1: distribute left ----------
  if (needsDistribute(leftSpec.shape)) {
    const s1 = buildDistributeStep1(leftSpec.m!, leftSpec.n!, x, "left");
    steps.push({
      stepId: "distribute_left_first_term",
      rowUpdates: [
        { slotId: "left_distributed", row: { cells: assembleBothSides(s1.resultCell, leftCell2, rightCell1, rightCell2) } },
      ],
      prompt: s1.prompt,
      choices: s1.choices,
      explanationOnCorrect: s1.explanation,
    });
    leftCell1 = s1.resultCell;

    const s2 = buildDistributeStep2(leftSpec.m!, leftSpec.p!, "left");
    const newLeftCell2 =
      leftSpec.shape === "PAREN"
        ? s2.mpSigned
        : leftSpec.shape === "PAREN_PLUS_VAR"
        ? `${s2.mpSigned} ${renderMultiplyTerm(leftSpec.k!, x, true)}`
        : `${s2.mpSigned} ${renderConstant(leftSpec.k!, true)}`;
    steps.push({
      stepId: "distribute_left_second_term",
      rowUpdates: [
        { slotId: "left_distributed", row: { cells: assembleBothSides(leftCell1, newLeftCell2, rightCell1, rightCell2) } },
      ],
      prompt: s2.prompt,
      choices: s2.choices,
      explanationOnCorrect: s2.explanation,
    });
    leftCell2 = newLeftCell2;
  }

  // ---------- Phase 2: distribute right ----------
  if (needsDistribute(rightSpec.shape)) {
    const s1 = buildDistributeStep1(rightSpec.m!, rightSpec.n!, x, "right");
    steps.push({
      stepId: "distribute_right_first_term",
      rowUpdates: [
        { slotId: "right_distributed", row: { cells: assembleBothSides(leftCell1, leftCell2, s1.resultCell, rightCell2) } },
      ],
      prompt: s1.prompt,
      choices: s1.choices,
      explanationOnCorrect: s1.explanation,
    });
    rightCell1 = s1.resultCell;

    const s2 = buildDistributeStep2(rightSpec.m!, rightSpec.p!, "right");
    const newRightCell2 =
      rightSpec.shape === "PAREN"
        ? s2.mpSigned
        : rightSpec.shape === "PAREN_PLUS_VAR"
        ? `${s2.mpSigned} ${renderMultiplyTerm(rightSpec.k!, x, true)}`
        : `${s2.mpSigned} ${renderConstant(rightSpec.k!, true)}`;
    steps.push({
      stepId: "distribute_right_second_term",
      rowUpdates: [
        { slotId: "right_distributed", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, newRightCell2) } },
      ],
      prompt: s2.prompt,
      choices: s2.choices,
      explanationOnCorrect: s2.explanation,
    });
    rightCell2 = newRightCell2;
  }

  // ---------- Phase 3: combine left ----------
  if (needsCombine(leftSpec.shape)) {
    if (leftSpec.shape === "COMBINE_VAR") {
      const c = buildCombineVarStep(leftSpec.a1!, leftSpec.a2!, x, "left");
      leftCell1 = plainTerm(c.combined, x);
      leftCell2 = renderConstant(leftSpec.finalConst, true);
      steps.push({
        stepId: "combine_left",
        rowUpdates: [{ slotId: "left_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (leftSpec.shape === "COMBINE_CONST") {
      const c = buildCombineConstStep(leftSpec.b1!, leftSpec.b2!, "left");
      leftCell2 = renderConstant(c.combined, true);
      steps.push({
        stepId: "combine_left",
        rowUpdates: [{ slotId: "left_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (leftSpec.shape === "PAREN_PLUS_VAR") {
      const mn = leftSpec.m! * leftSpec.n!;
      const c = buildCombineVarStep(mn, leftSpec.k!, x, "left");
      leftCell1 = plainTerm(c.combined, x);
      leftCell2 = renderConstant(leftSpec.m! * leftSpec.p!, true);
      steps.push({
        stepId: "combine_left",
        rowUpdates: [{ slotId: "left_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (leftSpec.shape === "PAREN_PLUS_CONST") {
      const mp = leftSpec.m! * leftSpec.p!;
      const c = buildCombineConstStep(mp, leftSpec.k!, "left");
      leftCell2 = renderConstant(c.combined, true);
      steps.push({
        stepId: "combine_left",
        rowUpdates: [{ slotId: "left_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    }
  }

  // ---------- Phase 4: combine right ----------
  if (needsCombine(rightSpec.shape)) {
    if (rightSpec.shape === "COMBINE_VAR") {
      const c = buildCombineVarStep(rightSpec.a1!, rightSpec.a2!, x, "right");
      rightCell1 = plainTerm(c.combined, x);
      rightCell2 = renderConstant(rightSpec.finalConst, true);
      steps.push({
        stepId: "combine_right",
        rowUpdates: [{ slotId: "right_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (rightSpec.shape === "COMBINE_CONST") {
      const c = buildCombineConstStep(rightSpec.b1!, rightSpec.b2!, "right");
      rightCell2 = renderConstant(c.combined, true);
      steps.push({
        stepId: "combine_right",
        rowUpdates: [{ slotId: "right_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (rightSpec.shape === "PAREN_PLUS_VAR") {
      const mn = rightSpec.m! * rightSpec.n!;
      const c = buildCombineVarStep(mn, rightSpec.k!, x, "right");
      rightCell1 = plainTerm(c.combined, x);
      rightCell2 = renderConstant(rightSpec.m! * rightSpec.p!, true);
      steps.push({
        stepId: "combine_right",
        rowUpdates: [{ slotId: "right_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    } else if (rightSpec.shape === "PAREN_PLUS_CONST") {
      const mp = rightSpec.m! * rightSpec.p!;
      const c = buildCombineConstStep(mp, rightSpec.k!, "right");
      rightCell2 = renderConstant(c.combined, true);
      steps.push({
        stepId: "combine_right",
        rowUpdates: [{ slotId: "right_combined", row: { cells: assembleBothSides(leftCell1, leftCell2, rightCell1, rightCell2) } }],
        prompt: c.prompt,
        choices: c.choices,
        explanationOnCorrect: c.explanation,
      });
    }
  }

  // ---------- Phase 5-6: isolate variable left, isolate constant right ----------
  // At this point leftCell1/leftCell2/rightCell1/rightCell2 exactly match
  // what variablesBothSides.ts's own initialRow would render for
  // (aLeft, bLeft, aRight, bRight) - same renderMultiplyTerm/renderConstant
  // calls with the same forceSign flags - so its steps can just continue
  // from here with no visual discontinuity, even though they were built
  // for a much simpler starting equation.
  const vbs = buildVariablesBothSidesInstance({ aLeft, aRight, bLeft, bRight, solution }, x);
  steps.push(...vbs.steps);

  return {
    initialRow,
    steps,
    eqColumnIndex: 2,
    columnCount: 5,
  };
}

export function generateMultiStepEquationsInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
