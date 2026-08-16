// Shared types for every skill, regardless of archetype.
// One skill = one file in this shape. The solver engine reads this;
// nothing here is specific to two-step equations except the file that uses it.

export interface Choice {
  text: string;
  isCorrect: boolean;
  // Links back to a documented misconception (from the Skills Document).
  // null = not a real misconception, just a plausible wrong click.
  misconceptionTag: string | null;
}

export interface GridRow {
  // Always 4 cells: [term A, term B, equals sign, right-hand side]
  // Each cell is its own KaTeX string. This is what keeps cancellation
  // annotations aligned under the exact term they modify, no matter
  // how long the surrounding terms are.
  cells: [string, string, string, string];
  // "success" = the final correct-answer highlight used everywhere.
  // "phase-blue"/"phase-green" = a sustained color across a whole phase
  // of a multi-phase skill (e.g. the elimination/scaling phase vs. the
  // substitution phase of systems of equations), not a correctness signal.
  highlight?: "success" | "phase-blue" | "phase-green";
}

// Two equations shown together (used by systems-of-equations skills
// during the setup/scaling/combining phase, before elimination reduces
// things to a single equation). Same 4-cell shape per equation as
// GridRow, just two of them. Distinguished from GridRow structurally
// (this has `eq1`/`eq2`, GridRow has `cells`) rather than via an added
// discriminator field - deliberately, so GridRow's existing shape never
// has to change and no existing skill file is affected by this at all.
export interface PairedGridRow {
  eq1: [string, string, string, string];
  eq2: [string, string, string, string];
  // Each equation gets its own highlight (not one shared value) - a
  // real need, not over-engineering: during scaling, one equation can be
  // fully done (solid blue) while the other is still mid-transition
  // (default color, with just its multiplier explicitly colored via an
  // embedded KaTeX \textcolor command).
  eq1Highlight?: "success" | "phase-blue" | "phase-green";
  eq2Highlight?: "success" | "phase-blue" | "phase-green";
}

export interface RowUpdate {
  // A stable identifier for this row's visual position. If a later step
  // reuses the same slotId, it REPLACES that row in place (same position,
  // new content) instead of adding a new line below it.
  slotId: string;
  row: GridRow | PairedGridRow;
}

export interface SolverStep {
  stepId: string;
  rowUpdates: RowUpdate[];
  prompt: string;
  choices: Choice[];
  explanationOnCorrect: string;
  // Optional: shows a small reference diagram above the grid,
  // "coefficient(term1term2)", with an arc from the coefficient to
  // term1 once the first distribute step is answered, and a second arc
  // to term2 once the second is also answered. Set this with the SAME
  // values on both distribute steps in a skill - StepSolver figures out
  // how many arcs to show from which step is current and whether it's
  // been revealed. Left undefined for every other kind of step.
  distributeVisual?: DistributeVisual;
}

export interface DistributeVisual {
  coefficient: string; // e.g. "3" or "-6"
  term1: string; // e.g. "-4x" - original (undistributed) form
  term2: string; // e.g. "+4" or "-4" - original (undistributed) form
  // Optional: which equation this belongs to, for skills showing two
  // equations at once (systems of equations). Left undefined for
  // single-equation skills like parentheses/distribution, where there's
  // only ever one arrow diagram and it always attaches to row 0.
  equation?: "eq1" | "eq2";
  // Optional: the stepIds marking when arc 1 and arc 2 should appear.
  // Defaults to "distribute_first_term"/"distribute_second_term" (the
  // parentheses skill's convention) when omitted, so existing behavior
  // is unchanged for any skill that doesn't set these.
  firstTermStepId?: string;
  secondTermStepId?: string;
  // Optional: the stepId of the step whose reveal FIRST makes this
  // annotation valid to show at all (not just how many arcs - whether
  // to render the diagram in place of the plain row at all). Without
  // this, a skill whose row content only becomes annotated after a
  // student answers a preceding question (e.g. "what should you
  // multiply by?") would show the diagram - and the answer it implies -
  // before that question is even answered. Left undefined for
  // parentheses/distribution, where the diagram is valid from the very
  // first step, no gating needed.
  chooseStepId?: string;
}

export interface SolverInstance {
  initialRow: GridRow | PairedGridRow; // always visible, before any step is answered
  steps: SolverStep[];
  // Which of the 4 columns holds the equals sign for this instance. This
  // depends on equation orientation (expression-first vs constant-first)
  // and is fixed for the whole problem, but is NOT always column index 2.
  eqColumnIndex: 0 | 1 | 2 | 3;
  // Optional: right-align term cells instead of the default center
  // alignment. Center-aligning cells of different widths in the same
  // column (e.g. "y" vs "5y") doesn't guarantee the variable itself lines
  // up - right-aligning does, since it anchors the last character.
  // Left undefined for every skill except systems of equations, where
  // aligning two full equations' variables against each other matters
  // more than it does for a single equation's own history.
  termAlign?: "right";
}
