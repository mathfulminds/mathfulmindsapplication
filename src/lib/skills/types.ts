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
  // Always ends with [..., equals sign, right-hand side] - everything
  // before those last two positions is a term column. Most skills use
  // exactly 2 term columns (4 cells total); a skill can use more when it
  // genuinely needs to show more than 2 separate terms on one side
  // without combining them into one column's text (which is what keeps
  // cancellation annotations aligned under the exact term they modify,
  // no matter how long the surrounding terms are, or how many there
  // are). The equals-sign position is always cells.length - 2.
  cells: readonly string[];
  // Pulls the NEXT row this many px closer (negative value shrinks the
  // gap). The grid's own rowGap is 20px, but each cell also has its own
  // line-height creating extra space above/below its content - so fully
  // closing the gap takes more than just -20 (canceling rowGap alone).
  // Used when a later row needs to visually attach to an earlier one,
  // like a division bar growing directly out of the numerator already
  // shown on the row above, rather than floating with the same spacing
  // every other row uses.
  marginBottom?: number;
  // "success" = the final correct-answer highlight used everywhere.
  // "phase-blue"/"phase-green" = a sustained color across a whole phase
  // of a multi-phase skill (e.g. the elimination/scaling phase vs. the
  // substitution phase of systems of equations), not a correctness signal.
  highlight?: "success" | "phase-blue" | "phase-green" | "phase-red";
  // Optional: renders this row as a single full-width text line instead
  // of the normal per-column cells, ignoring `cells` entirely when set.
  // For final answers that aren't an "x = value" equation - e.g. a
  // qualitative verdict like "No Solution" or "Infinite Solutions" - since
  // those don't fit the term/eq/term column shape at all. Not for
  // mid-solve annotations: a caption revealed on an early step (before
  // the actual answer) still lands in the same shared grid as every other
  // row and should use normal cells, or it'll misrepresent what's been
  // solved so far. Spans the whole grid as ONE item rather than
  // splitting across columns, so it never forces those columns wider for
  // every other row sharing the same grid.
  caption?: string;
}

// Two equations shown together (used by systems-of-equations skills
// during the setup/scaling/combining phase, before elimination reduces
// things to a single equation). Same shape per equation as GridRow, just
// two of them. Distinguished from GridRow structurally (this has
// `eq1`/`eq2`, GridRow has `cells`) rather than via an added
// discriminator field - deliberately, so GridRow's existing shape never
// has to change and no existing skill file is affected by this at all.
export interface PairedGridRow {
  eq1: readonly string[];
  eq2: readonly string[];
  // Each equation gets its own highlight (not one shared value) - a
  // real need, not over-engineering: during scaling, one equation can be
  // fully done (solid blue) while the other is still mid-transition
  // (default color, with just its multiplier explicitly colored via an
  // embedded KaTeX \textcolor command).
  eq1Highlight?: "success" | "phase-blue" | "phase-green" | "phase-red";
  eq2Highlight?: "success" | "phase-blue" | "phase-green" | "phase-red";
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
  // Optional: which row this arrow attaches to, by slot id - defaults to
  // "__initial__" (row 0) when omitted, matching every existing skill's
  // behavior (parentheses and elimination both want their arrow on the
  // permanent original equation). Set this explicitly for an arrow that
  // belongs on a row further down the page, like a substitution step's
  // "substitute" row - without it, the arrow silently attaches to row 0
  // regardless of which row it was conceptually meant for.
  targetSlotId?: string;
  // Optional: a term that sits alongside the distributed expression in
  // the SAME row but is NOT part of it - e.g. systems substitution's
  // "kept" term (the other equation's own untouched coefficient), which
  // shares the row with the substituted expression the arc annotates.
  // Without this, that term would silently disappear: the arc's
  // spanning cell always consumes BOTH term columns unconditionally, so
  // whatever isn't the annotated expression gets discarded rather than
  // rendered. Exactly one of prefix/suffix applies depending on which
  // side of the distributed expression the kept term originally sat on.
  prefix?: string;
  prefixColor?: string;
  suffix?: string;
  suffixColor?: string;
  // Optional: explicitly which two (adjacent) column indices the arc
  // spans. Without this, the column pair is inferred from
  // eqColumnIndex, which assumes exactly 2 term columns - a skill using
  // 3 term columns needs to say explicitly which 2 of them the arc
  // belongs to, since that can vary depending on where the substituted
  // expression actually sits.
  termCols?: [number, number];
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
  // Which column holds the equals sign for this instance. This depends
  // on equation orientation/shape and is fixed for the whole problem.
  // Most skills stay within 0-3 (four columns or fewer per side), but
  // isn't bounded to that range - a skill with genuinely many term
  // columns per side (e.g. multi-step equations with several like terms
  // to combine) needs a correspondingly larger index.
  eqColumnIndex: number;
  // Optional: right-align term cells instead of the default center
  // alignment. Center-aligning cells of different widths in the same
  // column (e.g. "y" vs "5y") doesn't guarantee the variable itself lines
  // up - right-aligning does, since it anchors the last character.
  // Left undefined for every skill except systems of equations, where
  // aligning two full equations' variables against each other matters
  // more than it does for a single equation's own history.
  termAlign?: "right";
  // Optional: draws downward/curved arrows connecting the bottom of one
  // row to the top of another, keyed by their slotIds - unlike
  // DistributeVisual's arcs (which connect cells WITHIN one row), this
  // connects two ENTIRELY DIFFERENT rows, for cases like "this
  // substituted value came from that isolated expression above." Each
  // entry only renders once both its rows are actually visible on
  // screen. Plural because a two-track layout can need more than one -
  // e.g. one arrow crossing left-to-right for a substitution, and
  // another crossing right-to-left for a later back-substitution.
  rowConnectors?: { fromSlotId: string; toSlotId: string }[];
  // Optional: renders the initial paired row (row 0, when it's two
  // equations) as two independent side-by-side mini-grids instead of
  // stacked directly on top of each other. Purely a presentation choice -
  // every other row still renders in the normal single shared grid below
  // it. Left unset (stacked) for every existing skill.
  pairedLayout?: "sideBySide";
  // Optional: splits the ENTIRE row flow (not just row 0) into two
  // independent, fully separate side-by-side columns, each with its own
  // column-width calculation - e.g. everything about isolating a
  // variable on the left, everything about substituting and solving on
  // the right. This is a bigger structural change than pairedLayout:
  // rows assigned to a track only align with other rows in the SAME
  // track, not with anything in the other track or in fullWidthSlotIds.
  // Any slot not listed in either array renders in the normal shared
  // grid below both tracks, exactly as it would without trackLayout set
  // at all. Left unset for every skill except ones that explicitly need
  // two genuinely independent tracks of work.
  trackLayout?: { leftSlotIds: string[]; rightSlotIds: string[] };
  // Optional: overrides the split-screen panel width ratio (a raw CSS
  // grid-template-columns value, e.g. "3fr 2fr"). Defaults to "1fr 1fr"
  // for every skill that doesn't set this. Exists because the two-track
  // layout genuinely needs more horizontal room on the math side than a
  // single equation ever does - widening the split globally would just
  // waste space on simpler skills instead of helping anyone.
  panelRatio?: string;
  // Optional: overrides the right (question) panel's padding, given as
  // a raw CSS padding value. Defaults to "32px 28px" for every skill
  // that doesn't set this. Exists for skills where the math panel
  // genuinely needs the extra width more than the question panel needs
  // the extra breathing room.
  questionPanelPadding?: string;
  // Optional: explicit total column count for this instance's grid,
  // overriding the eqColumnIndex-based inference. Needed when a row has
  // more columns than the standard formula assumes for its eqColumnIndex -
  // e.g. variables-on-both-sides, where BOTH sides are full two-term
  // expressions (5 cells: term, term, "=", term, term) with eqColumnIndex=2,
  // which collides with the standard 4-cell expressionLeft row that also
  // uses eqColumnIndex=2. Left undefined for every skill where the existing
  // formula already gives the right answer.
  columnCount?: number;
  // Optional: bolds a specific row once a given step has been reached -
  // e.g. drawing attention back to the isolated equation the moment the
  // other variable's value is found, since that's the exact moment it
  // becomes the thing to work on next.
  boldAfter?: { slotId: string; afterStepId: string };
}
