// The skills a student can pick on the "Solve your own problem" page to
// load an example problem into the math editor. Each example comes from
// that skill's own random generator (the same one its practice page uses),
// converted into editor text.

import type { SolverInstance, GridRow, PairedGridRow } from "@/lib/skills/types";
import { SKILLS } from "./routeEquation";
import type { SkillInfo } from "./routeEquation";
import { generateOneStepInstance } from "@/lib/skills/oneStepEquations";
import { generateOneStepInequalityInstance } from "@/lib/skills/oneStepInequalities";
import { generateTwoStepInstance } from "@/lib/skills/twoStepEquations";
import { generateTwoStepInequalityInstance } from "@/lib/skills/twoStepInequalities";
import { generateFractionInstance } from "@/lib/skills/fractionalCoefficients";
import { generateFractionalCoefficientsInequalityInstance } from "@/lib/skills/fractionalCoefficientsInequalities";
import { generateNonIntegerInstance } from "@/lib/skills/nonIntegerSolutions";
import { generateNonIntegerInequalityInstance } from "@/lib/skills/nonIntegerSolutionsInequalities";
import { generateParenthesesEquationInstance } from "@/lib/skills/parenthesesEquations";
import { generateParenthesesInequalityInstance } from "@/lib/skills/parenthesesInequalities";
import { generateCombiningLikeTermsInstance } from "@/lib/skills/combiningLikeTerms";
import { generateVariablesBothSidesInstance } from "@/lib/skills/variablesBothSides";
import { generateVariablesBothSidesInfiniteOrNoSolutionsInstance } from "@/lib/skills/variablesBothSidesInfiniteOrNoSolutions";
import { generateMultiStepEquationsNoParenthesesInstance } from "@/lib/skills/multiStepEquationsNoParentheses";
import { generateMultiStepEquationsWithParenthesesInstance } from "@/lib/skills/multiStepEquationsWithParentheses";
import { generateProportionInstance } from "@/lib/skills/proportions";
import { generateDistributeNegativeInstance } from "@/lib/skills/distributeNegative";
import { generateOneStepRationalInstance } from "@/lib/skills/oneStepRational";
import { generateEliminationInstance } from "@/lib/skills/systemsElimination";
import { generateSubstitutionInstanceTwoTrack } from "@/lib/skills/systemsSubstitutionHorizontal";

export interface SkillExample {
  title: string; // as shown on the Skills page
  skill: SkillInfo;
  generate: () => SolverInstance;
}

export interface SkillExampleGroup {
  label: string;
  color: string;
  skills: SkillExample[];
}

// Same groups, order, and titles as src/app/skills/page.tsx.
export const SKILL_GROUPS: SkillExampleGroup[] = [
  {
    label: "Equations",
    color: "var(--blue)",
    skills: [
      { title: "One-Step Equations", skill: SKILLS.oneStepEq, generate: generateOneStepInstance },
      {
        title: "One-Step Equations with Fractions & Decimals",
        skill: SKILLS.oneStepRational,
        generate: () => generateOneStepRationalInstance(Math.random() < 0.5 ? "fraction" : "decimal"),
      },
      { title: "Two-Step Equations", skill: SKILLS.twoStepEq, generate: generateTwoStepInstance },
      { title: "Proportions", skill: SKILLS.proportion, generate: generateProportionInstance },
      { title: "Equations with Parentheses", skill: SKILLS.parenEq, generate: generateParenthesesEquationInstance },
      { title: "Distributing a Negative", skill: SKILLS.distNeg, generate: generateDistributeNegativeInstance },
      { title: "Fractional Coefficients", skill: SKILLS.fracEq, generate: generateFractionInstance },
      { title: "Non-Integer Solutions", skill: SKILLS.nonIntEq, generate: () => generateNonIntegerInstance("fraction") },
      { title: "Combining Like Terms", skill: SKILLS.combineLike, generate: generateCombiningLikeTermsInstance },
      { title: "Variables on Both Sides", skill: SKILLS.bothSides, generate: generateVariablesBothSidesInstance },
      {
        title: "Variables Both Sides Infinite or No Solutions",
        skill: SKILLS.bothSidesSpecial,
        generate: generateVariablesBothSidesInfiniteOrNoSolutionsInstance,
      },
      {
        title: "Multi-Step Equations (No Parentheses)",
        skill: SKILLS.multiNoParen,
        generate: generateMultiStepEquationsNoParenthesesInstance,
      },
      {
        title: "Multi-Step Equations (With Parentheses)",
        skill: SKILLS.multiWithParen,
        generate: generateMultiStepEquationsWithParenthesesInstance,
      },
    ],
  },
  {
    label: "Inequalities",
    color: "var(--coral)",
    skills: [
      { title: "One-Step Inequalities", skill: SKILLS.oneStepIneq, generate: generateOneStepInequalityInstance },
      { title: "Two-Step Inequalities", skill: SKILLS.twoStepIneq, generate: generateTwoStepInequalityInstance },
      { title: "Inequalities with Parentheses", skill: SKILLS.parenIneq, generate: generateParenthesesInequalityInstance },
      { title: "Fractional Coefficients", skill: SKILLS.fracIneq, generate: generateFractionalCoefficientsInequalityInstance },
      {
        title: "Non-Integer Inequalities",
        skill: SKILLS.nonIntIneq,
        generate: () => generateNonIntegerInequalityInstance("fraction"),
      },
    ],
  },
  {
    label: "Systems of Equations",
    color: "var(--green)",
    skills: [
      { title: "Substitution", skill: SKILLS.substitution, generate: generateSubstitutionInstanceTwoTrack },
      { title: "Elimination", skill: SKILLS.elimination, generate: () => generateEliminationInstance() },
    ],
  },
];

// Turns a generated problem's first row (the problem as stated) into
// LaTeX for the editor: drop the grid's spacing/blank-cell markers and
// join the cells back into one line.
function cellsToLatex(cells: readonly string[]): string {
  return cells
    .map((c) =>
      c
        .replace(/^(LEFTALIGN:|PLAINTEXT:|MARKEDTERM:)+/, "")
        .replace(/[\u0003\u0004]/g, "")
        .replace(/\\hspace\{[^}]*\}/g, "")
        .replace(/\\phantom\{0\}/g, "")
        .replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, "$1")
        .replace(/\\dfrac/g, "\\frac")
        .trim()
    )
    .filter(Boolean)
    .join(" ");
}

export function exampleLatex(instance: SolverInstance): string {
  const row = instance.initialRow as GridRow | PairedGridRow;
  if ((row as PairedGridRow).eq1) {
    const paired = row as PairedGridRow;
    return `${cellsToLatex(paired.eq1)},${cellsToLatex(paired.eq2)}`;
  }
  return cellsToLatex((row as GridRow).cells);
}
