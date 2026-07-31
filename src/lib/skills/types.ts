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
  highlight?: "success";
}

export interface RowUpdate {
  // A stable identifier for this row's visual position. If a later step
  // reuses the same slotId, it REPLACES that row in place (same position,
  // new content) instead of adding a new line below it.
  slotId: string;
  row: GridRow;
}

export interface SolverStep {
  stepId: string;
  rowUpdates: RowUpdate[];
  prompt: string;
  choices: Choice[];
  explanationOnCorrect: string;
}

export interface SolverInstance {
  initialRow: GridRow; // always visible, before any step is answered
  steps: SolverStep[];
  // Which of the 4 columns holds the equals sign for this instance. This
  // depends on equation orientation (expression-first vs constant-first)
  // and is fixed for the whole problem, but is NOT always column index 2.
  eqColumnIndex: 0 | 1 | 2 | 3;
}
