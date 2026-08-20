import type { SolverInstance } from "./types";
import { generateSubstitution, buildSubstitutionSolverInstance } from "./systemsSubstitution";

// True two-track layout: Equation 1 (always blue) stays fixed on the
// left, Equation 2 (always red) stays fixed on the right - regardless
// of which one happens to be isolated - and each track shows whichever
// phase of work (isolating vs. substituting/solving) actually belongs
// to that equation. This is different from an earlier, wrong version of
// this file that relabeled the equations themselves based on their
// ROLE (isolate vs. other) rather than their fixed identity - which
// made the blue/red equations visually swap sides between problems.
// Identity now never moves; only which slot list (isolate-phase vs.
// substitute-phase) is assigned to the left vs. right track changes,
// based on which equation is actually being isolated this time.
//
// Reuses generateSubstitution() and buildSubstitutionSolverInstance()
// completely unchanged - every number, every choice, every distractor
// is identical to the real vertical skill, already verified at
// 100,000-case scale there. This file only restructures how that SAME
// data gets grouped into tracks; it computes no math of its own.
export function generateSubstitutionInstanceTwoTrack(): SolverInstance {
  const inst = generateSubstitution();
  const base = buildSubstitutionSolverInstance(inst);

  const isolateSlotIds = [
    "cancel",
    "isolate",
    "isolate_final",
    "back_substitute_pending",
    "back_substitute_computed",
    "back_substitute_final",
  ];
  const substituteSlotIds = [
    "substitute",
    "expand",
    "expand_combined",
    "solve_cancel_annotation",
    "solve_simplified",
    "solve_final",
  ];

  // Equation 1 is always the left track, Equation 2 always the right -
  // untouched, matching initialRow's own fixed eq1=blue/eq2=red
  // assignment. Whichever slot list actually belongs on each side
  // depends only on which equation is being isolated this time.
  const leftSlotIds = inst.isolateEq === 1 ? isolateSlotIds : substituteSlotIds;
  const rightSlotIds = inst.isolateEq === 1 ? substituteSlotIds : isolateSlotIds;

  return {
    ...base,
    trackLayout: { leftSlotIds, rightSlotIds },
    panelRatio: "7fr 3fr",
    questionPanelPadding: "32px 16px",
    // The isolated equation becomes bold the moment the other variable
    // is solved - that's exactly when it becomes the next thing to work
    // on, before the student substitutes back into it.
    // Note: "compute_value" here is the reused two-step engine's own
    // internal step id for its final step - only its SLOT ids get
    // prefixed with "solve_" (see solveForRemainingSteps above), not its
    // step ids, so referencing "solve_final" here would never match
    // anything and silently never trigger.
    // Fires only once the student has actually chosen to substitute back
    // into the isolated equation (not merely once the other variable's
    // value becomes known) - bolding it any earlier would be telling the
    // student what to do next before they've made that choice themselves.
    boldAfter: { slotId: "isolate_final", afterStepId: "choose_back_substitute" },
    // No connector arrows in this layout - they crossed the whole width
    // of the page diagonally between two independently-positioned
    // tracks, which read as clunky and confusing rather than helpful.
    // The color-coding on the substituted expression (matching the
    // equation it came from) already conveys that connection without
    // needing an explicit line drawn across the page.
    rowConnectors: [],
  };
}
