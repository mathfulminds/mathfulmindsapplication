import type { SolverInstance } from "@/lib/skills/types";

const BLANK = "\\phantom{0}";

// A single fixed example for the homepage's "see it in action" demo -
// NOT randomly generated, unlike every real skill page. Built from the
// exact same GridRow/SolverStep/SolverInstance shapes StepSolver already
// knows how to render, so this gets real KaTeX (proper stacked
// fractions, not slash-separated text) and the app's real progress bar,
// colors, and layout for free - no separate "make it look like the app"
// styling to keep in sync by hand.
export function generateHomepageDemo(): SolverInstance {
  return {
    initialRow: { cells: ["11", "-12a", "=", "-97"] },
    eqColumnIndex: 2,
    steps: [
      {
        stepId: "eliminate_constant",
        rowUpdates: [
          { slotId: "cancel", row: { cells: ["-11", BLANK, "", "-11"] } },
          { slotId: "simplified", row: { cells: ["-12a", BLANK, "=", "-108"] } },
        ],
        prompt: 'What operation undoes the "+11" on the left?',
        choices: [
          { text: "Subtract 11 from both sides", isCorrect: true, misconceptionTag: null },
          { text: "Divide both sides by 11", isCorrect: false, misconceptionTag: null },
          { text: "Add 12a to both sides", isCorrect: false, misconceptionTag: null },
        ],
        explanationOnCorrect: "Undo addition by subtracting 11 from both sides.",
      },
      {
        stepId: "eliminate_coefficient",
        rowUpdates: [
          {
            slotId: "simplified",
            row: { cells: ["\\dfrac{-12a}{-12}", BLANK, "=", "\\dfrac{-108}{-12}"] },
          },
        ],
        prompt: "What undoes multiplying a by −12?",
        choices: [
          { text: "Multiply both sides by −12", isCorrect: false, misconceptionTag: null },
          { text: "Divide both sides by −12", isCorrect: true, misconceptionTag: null },
          { text: "Add −12 to both sides", isCorrect: false, misconceptionTag: null },
        ],
        explanationOnCorrect: "Undo multiplication by dividing both sides by −12.",
      },
      {
        stepId: "compute_value",
        rowUpdates: [{ slotId: "final", row: { cells: ["a", BLANK, "=", "9"], highlight: "success" } }],
        prompt: "What is the value of a?",
        choices: [
          { text: "a = 9", isCorrect: true, misconceptionTag: null },
          { text: "a = −9", isCorrect: false, misconceptionTag: null },
          { text: "a = 96", isCorrect: false, misconceptionTag: null },
        ],
        explanationOnCorrect: "−108 ÷ −12 = 9. A negative divided by a negative is positive.",
      },
    ],
  };
}
