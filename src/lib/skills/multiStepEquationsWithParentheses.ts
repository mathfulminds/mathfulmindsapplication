import type { SolverInstance } from "./types";
import type { EquationInstance, Shape } from "./multiStepEquationsCore";
import {
  buildSideSpec,
  buildSolverInstance as buildCoreInstance,
  generateBaseEquationValues,
} from "./multiStepEquationsCore";

const PAREN_FAMILY: Shape[] = ["PAREN", "PAREN_PLUS_VAR", "PAREN_PLUS_CONST"];

function isParenFamily(shape: Shape): boolean {
  return (PAREN_FAMILY as string[]).includes(shape);
}

export function generateEquation(): EquationInstance {
  const base = generateBaseEquationValues();
  const shapePool: Exclude<Shape, "SIMPLE">[] = ["PAREN", "PAREN_PLUS_VAR", "PAREN_PLUS_CONST", "COMBINE_VAR", "COMBINE_CONST"];

  let leftSpec = buildSideSpec(base.aLeft, base.bLeft, shapePool);
  let rightSpec = buildSideSpec(base.aRight, base.bRight, shapePool);

  // This skill's whole point is practicing distribution - guarantee at
  // least one side actually needs it, rather than leaving that to chance
  // and occasionally generating a problem indistinguishable from the
  // no-parentheses skill. Force just ONE side (picked at random) to keep
  // retrying specifically against the parens-only shapes if neither side
  // landed on one naturally.
  if (!isParenFamily(leftSpec.shape) && !isParenFamily(rightSpec.shape)) {
    const forceLeft = Math.random() < 0.5;
    for (let tries = 0; tries < 10; tries++) {
      const forced = buildSideSpec(
        forceLeft ? base.aLeft : base.aRight,
        forceLeft ? base.bLeft : base.bRight,
        PAREN_FAMILY as Exclude<Shape, "SIMPLE">[],
        true
      );
      if (isParenFamily(forced.shape)) {
        if (forceLeft) leftSpec = forced;
        else rightSpec = forced;
        break;
      }
    }
  }

  return { ...base, leftSpec, rightSpec };
}

export function buildSolverInstance(eq: EquationInstance, variableSymbol: string = "x"): SolverInstance {
  return buildCoreInstance(eq, variableSymbol);
}

export function generateMultiStepEquationsWithParenthesesInstance(): SolverInstance {
  const eq = generateEquation();
  return buildSolverInstance(eq);
}
