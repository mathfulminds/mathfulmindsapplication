"use client";

import StepSolver from "@/components/solver/StepSolver";
import { generateHomepageDemo } from "@/lib/demo/homepageDemo";

// Thin wrapper: the actual demo now IS the real solver, given a fixed
// (non-random) example instead of a randomly generated one. This is
// what guarantees the homepage always looks pixel-identical to the real
// experience - it's not a lookalike, it's the same component.
//
// finalButtonLabel is overridden here specifically: since this demo
// always shows the exact same problem rather than generating a new one,
// "try the problem again" is accurate where "try a new problem" (every
// other skill page's default) would not be.
export default function StepDemo() {
  return (
    <StepSolver
      generate={generateHomepageDemo}
      skillName="Solving two-step equations"
      finalButtonLabel="Try the problem again →"
      celebrateOnComplete
    />
  );
}
