import type { SolverInstance, SolverStep, GridRow } from "./types";
import { BLANK, assembleBothSides, randBool, randInt, renderConstant, renderMultiplyTerm } from "./isolateVariableCore";

interface EquationInstance {
  a: number; // shared x-coefficient on both sides - this is what makes the variable vanish entirely
  bLeft: number;
  bRight: number;
  isIdentity: boolean; // bLeft === bRight -> infinite solutions; otherwise -> no solution
}

export function generateEquation(): EquationInstance {
  const a = randInt(2, 9) * (randBool() ? 1 : -1);
  const bLeft = randInt(-20, 20);

  const isIdentity = randBool();
  let bRight: number;
  if (isIdentity) {
    bRight = bLeft;
  } else {
    let diff = randInt(1, 15) * (randBool() ? 1 : -1);
    while (diff === 0) diff = randInt(1, 15) * (randBool() ? 1 : -1);
    bRight = bLeft + diff;
  }

  return { a, bLeft, bRight, isIdentity };
}

// Plain-text (non-LaTeX) signed term formatting for MCQ choice labels and
// prompts, which render as ordinary text, not through KaTeX.
function plainSignedTerm(coef: number, symbol: string): string {
  const sign = coef >= 0 ? "+" : "-";
  return `${sign}${Math.abs(coef)}${symbol}`;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildSolverInstance(
  eq: EquationInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { a, bLeft, bRight, isIdentity } = eq;
  const x = variableSymbol;

  const initialRow: GridRow = {
    cells: assembleBothSides(
      renderMultiplyTerm(a, x),
      renderConstant(bLeft, true),
      renderMultiplyTerm(a, x),
      renderConstant(bRight, true)
    ),
  };

  // ---------- Step 1: undo the variable term on the right ----------

  const absA = Math.abs(a);
  const aPositive = a >= 0;
  const opSym = aPositive ? "-" : "+"; // undo +a by subtracting, undo -a by adding

  const cancelVarDisplay = renderMultiplyTerm(-a, x, true);
  const cancelVarRow: GridRow = {
    cells: assembleBothSides(cancelVarDisplay, BLANK, cancelVarDisplay, BLANK, ""),
  };

  const correctOpText = aPositive
    ? `Subtracting ${absA}${x} from both sides`
    : `Adding ${absA}${x} to both sides`;

  const goal1: SolverStep = {
    stepId: "goal_variable_term",
    rowUpdates: [{ slotId: "cancel_var_annotation", row: cancelVarRow }],
    prompt: `Start with the variable. What undoes ${plainSignedTerm(a, x)}?`,
    choices: shuffle([
      { text: correctOpText, isCorrect: true, misconceptionTag: null },
      {
        text: aPositive
          ? `Adding ${absA}${x} to both sides`
          : `Subtracting ${absA}${x} from both sides`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
      {
        text: bRight >= 0
          ? `Subtracting ${Math.abs(bRight)} from both sides`
          : `Adding ${Math.abs(bRight)} to both sides`,
        isCorrect: false,
        misconceptionTag: "targets_wrong_term_first",
      },
    ]),
    explanationOnCorrect: "In order to get the variable term on the left side, we have to undo the right side.",
  };

  // ---------- Step 2: the x-terms cancel on BOTH sides at once, since ----------
  // they share the same coefficient - unlike the general "variables on
  // both sides" case, there's no leftover variable term to combine into.
  // The row reduces straight to a plain numeric equation.

  const reducedRow: GridRow = {
    cells: assembleBothSides(BLANK, renderConstant(bLeft), BLANK, renderConstant(bRight)),
  };

  const cancelDistractors = [
    { text: `${2 * absA}${x}`, tag: "flipped_the_operation" },
    { text: `${absA}${x}`, tag: "forgot_to_apply_operation" },
  ];

  const cancel1: SolverStep = {
    stepId: "cancel_variable_term",
    rowUpdates: [{ slotId: "reduced_equation", row: reducedRow }],
    prompt: `What is ${absA}${x} ${opSym} ${absA}${x}?`,
    choices: shuffle([
      { text: "0", isCorrect: true, misconceptionTag: null },
      { text: cancelDistractors[0].text, isCorrect: false, misconceptionTag: cancelDistractors[0].tag },
      { text: cancelDistractors[1].text, isCorrect: false, misconceptionTag: cancelDistractors[1].tag },
    ]),
    explanationOnCorrect: `The ${absA}${x} terms are opposites resulting in 0 on both sides, so the variable disappears completely.`,
  };

  // ---------- Step 3: interpret the reduced statement ----------

  const finalRow: GridRow = {
    cells: [],
    caption: isIdentity ? "Infinite Solutions" : "No Solution",
    highlight: "success",
  };

  const correctVerdict = isIdentity ? "Infinite solutions" : "No solution";
  const flippedVerdict = isIdentity ? "No solution" : "Infinite solutions";

  const interpret: SolverStep = {
    stepId: "interpret_result",
    rowUpdates: [{ slotId: "final", row: finalRow }],
    prompt: `The equation simplifies to ${bLeft} = ${bRight}. What does this tell us about the solution?`,
    choices: shuffle([
      { text: correctVerdict, isCorrect: true, misconceptionTag: null },
      { text: flippedVerdict, isCorrect: false, misconceptionTag: "flips_identity_and_contradiction" },
      { text: "One solution", isCorrect: false, misconceptionTag: "assumes_unique_solution_exists" },
    ]),
    explanationOnCorrect: isIdentity
      ? `Since ${bLeft} = ${bRight} is always true, every value of ${x} makes the original equation true.`
      : `Since ${bLeft} = ${bRight} is never true, no value of ${x} makes the original equation true.`,
  };

  return {
    initialRow,
    steps: [goal1, cancel1, interpret],
    eqColumnIndex: 2,
    columnCount: 5,
  };
}

export function generateVariablesBothSidesInfiniteOrNoSolutionsInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
