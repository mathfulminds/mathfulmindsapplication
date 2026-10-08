import type { SolverInstance } from "@/lib/skills/types";
import { buildSolverInstance as buildTwoStepInstance } from "@/lib/skills/twoStepEquations";

// The homepage's "see it in action" demo: always the same problem,
// 11 - 12a = -97, but built by the real Two-Step Equations skill - so it
// has exactly the same steps, cross-outs, spacing and layout as the
// practice page, and stays that way whenever the skill is improved.
export function generateHomepageDemo(): SolverInstance {
  return buildTwoStepInstance(
    { a: -12, b: 11, form: "multiply", variableFirst: false, orientation: "expressionLeft", rhs: -97, solution: 9 } as Parameters<
      typeof buildTwoStepInstance
    >[0],
    "a"
  );
}
