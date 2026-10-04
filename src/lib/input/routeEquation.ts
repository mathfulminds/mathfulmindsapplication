// Decides which skill a student's own problem belongs to, and builds it
// using that skill's existing step-by-step builder - the same builders
// the practice pages use, just fed the student's numbers instead of
// randomly generated ones.
//
// Matching is done on the problem's SURFACE shape (term order, which side
// the variable is on, how each coefficient was written), never on its
// simplified value, so the steps always start from exactly what the
// student typed. Anything that doesn't fit a skill cleanly gets a clear
// "not supported yet" message rather than a forced, rewritten version.

import type { SolverInstance } from "@/lib/skills/types";
import type { Fraction } from "@/lib/skills/fraction";
import { makeFraction, divFraction, mulFraction, negFraction } from "@/lib/skills/fraction";
import type { Orientation } from "@/lib/skills/isolateVariableCore";
import type { ComparisonSymbol } from "@/lib/skills/inequalityCore";
import { buildOneStepInstance as buildOneStepEq } from "@/lib/skills/oneStepEquations";
import { buildOneStepInstance as buildOneStepIneq } from "@/lib/skills/oneStepInequalities";
import { buildSolverInstance as buildTwoStepEq } from "@/lib/skills/twoStepEquations";
import { buildSolverInstance as buildTwoStepIneq } from "@/lib/skills/twoStepInequalities";
import { buildFractionSolverInstance as buildFracEq } from "@/lib/skills/fractionalCoefficients";
import { buildFractionSolverInstance as buildFracIneq } from "@/lib/skills/fractionalCoefficientsInequalities";
import { buildNonIntegerSolverInstance as buildNonIntEq } from "@/lib/skills/nonIntegerSolutions";
import { buildNonIntegerSolverInstance as buildNonIntIneq } from "@/lib/skills/nonIntegerSolutionsInequalities";
import { buildParenSolverInstance as buildParenEq } from "@/lib/skills/parenthesesEquations";
import { buildParenInequalitySolverInstance as buildParenIneq } from "@/lib/skills/parenthesesInequalities";
import { buildSolverInstance as buildCombineLike } from "@/lib/skills/combiningLikeTerms";
import { buildSolverInstance as buildBothSides } from "@/lib/skills/variablesBothSides";
import { buildSolverInstance as buildBothSidesSpecial } from "@/lib/skills/variablesBothSidesInfiniteOrNoSolutions";
import { buildSolverInstance as buildMultiNoParen } from "@/lib/skills/multiStepEquationsNoParentheses";
import { buildSolverInstance as buildMultiWithParen } from "@/lib/skills/multiStepEquationsWithParentheses";
import type { SideSpec } from "@/lib/skills/multiStepEquationsCore";
import { buildEliminationSolverInstance } from "@/lib/skills/systemsElimination";
import { buildSubstitutionInstanceTwoTrack } from "@/lib/skills/systemsSubstitutionHorizontal";
import { parseInput } from "./parseEquation";
import type { ParsedEquation, SurfaceTerm, VarTerm, ConstTerm, ParenTerm, Relation } from "./parseEquation";
import { validateInstance, blockingIssues } from "./validateInstance";

// ---------- public types ----------

export interface SkillInfo {
  id: string;
  name: string; // shown above the grid, same as the practice page's label
  href: string; // that skill's practice page
}

export interface SolveOption {
  id: string;
  label: string; // e.g. "Substitution" - only shown when there's a choice
  skill: SkillInfo;
  instance: SolverInstance;
}

export type RouteResult =
  | { ok: true; latex: string; options: SolveOption[] }
  | { ok: false; error: string; latex?: string };

export const SKILLS = {
  oneStepEq: { id: "oneStepEq", name: "One-step equations", href: "/solve/one-step-equations" },
  oneStepIneq: { id: "oneStepIneq", name: "One-step inequalities", href: "/solve/one-step-inequalities" },
  twoStepEq: { id: "twoStepEq", name: "Two-step equations", href: "/solve/two-step-equations" },
  twoStepIneq: { id: "twoStepIneq", name: "Two-step inequalities", href: "/solve/two-step-inequalities" },
  fracEq: { id: "fracEq", name: "Fractional coefficients", href: "/solve/fractional-coefficients" },
  fracIneq: { id: "fracIneq", name: "Fractional coefficients (inequalities)", href: "/solve/fractional-coefficients-inequalities" },
  nonIntEq: { id: "nonIntEq", name: "Fraction / decimal solutions", href: "/solve/non-integer-solutions" },
  nonIntIneq: { id: "nonIntIneq", name: "Fraction / decimal solutions (inequalities)", href: "/solve/non-integer-inequalities" },
  parenEq: { id: "parenEq", name: "Equations with parentheses", href: "/solve/parentheses-equations" },
  parenIneq: { id: "parenIneq", name: "Inequalities with parentheses", href: "/solve/parentheses-inequalities" },
  combineLike: { id: "combineLike", name: "Combining like terms", href: "/solve/combining-like-terms" },
  bothSides: { id: "bothSides", name: "Variables on both sides", href: "/solve/variables-both-sides" },
  bothSidesSpecial: {
    id: "bothSidesSpecial",
    name: "Variables on both sides: infinite or no solutions",
    href: "/solve/variables-both-sides-infinite-or-no-solutions",
  },
  multiNoParen: { id: "multiNoParen", name: "Multi-step equations", href: "/solve/multi-step-equations-no-parentheses" },
  multiWithParen: {
    id: "multiWithParen",
    name: "Multi-step equations with parentheses",
    href: "/solve/multi-step-equations-with-parentheses",
  },
  elimination: { id: "elimination", name: "Systems of equations: elimination", href: "/solve/systems-elimination" },
  substitution: { id: "substitution", name: "Systems of equations: substitution", href: "/solve/systems-substitution" },
} satisfies Record<string, SkillInfo>;

const SAFETY_MESSAGE =
  "This problem fits one of the skills, but a few of its steps wouldn't come out right with these exact numbers yet (this usually happens with special values like 1 or -1), so I'd rather not show them. Try a similar problem with different numbers.";

// ---------- small helpers ----------

class NotSupported extends Error {}
const fail = (msg: string): never => {
  throw new NotSupported(msg);
};

const val = (f: Fraction) => f.num / f.den;
const isInt = (f: Fraction) => f.den === 1;
const isZero = (f: Fraction) => f.num === 0;
const isVar = (t: SurfaceTerm): t is VarTerm => t.kind === "var";
const isConst = (t: SurfaceTerm): t is ConstTerm => t.kind === "const";
const isParen = (t: SurfaceTerm): t is ParenTerm => t.kind === "paren";
const sideHasVar = (side: SurfaceTerm[]) => side.some((t) => isVar(t) || (isParen(t) && t.inner.some(isVar)));
// A plain integer-coefficient term: "3x", "-x", "7" - the only kind the
// multi-term skills know how to draw.
const isPlainInt = (t: SurfaceTerm) =>
  (isConst(t) && isInt(t.value) && t.style === "int") || (isVar(t) && t.form === "multiply" && isInt(t.coef) && t.coefStyle === "int");

const SYMBOL: Record<Exclude<Relation, "=">, ComparisonSymbol> = { "<": "<", ">": ">", "<=": "\\leq", ">=": "\\geq" };

// The numbers the builders take for decimals must be exact enough to
// print back out the way they were typed (2.5, not 2.4999999).
function decimalOK(f: Fraction): boolean {
  let d = f.den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

// Linear total of one side: coefficient of the variable and the constant.
function sideTotals(side: SurfaceTerm[]): { coef: Fraction; constant: Fraction } {
  let coef = makeFraction(0, 1);
  let constant = makeFraction(0, 1);
  const add = (a: Fraction, b: Fraction) => makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
  for (const t of side) {
    if (isConst(t)) constant = add(constant, t.value);
    else if (isVar(t)) coef = add(coef, t.coef);
    else
      for (const inner of t.inner) {
        if (isConst(inner)) constant = add(constant, mulFraction(t.m, inner.value));
        else coef = add(coef, mulFraction(t.m, inner.coef));
      }
  }
  return { coef, constant };
}

const NOT_YET_INEQUALITY =
  "This kind of inequality isn't supported yet. Right now inequalities can be one-step, two-step, or a single set of parentheses, like 3(x + 2) > 12.";
const NOT_YET_GENERAL =
  "This problem is a shape I can't walk through step by step yet. Try a one-step, two-step, parentheses, combining-like-terms, or variables-on-both-sides equation.";
const INTEGER_ANSWER_ONLY =
  "This problem's answer isn't a whole number, and fraction or decimal answers are only supported for problems shaped like ax + b = c right now.";

// ---------- single equation / inequality ----------

interface Built {
  skill: SkillInfo;
  instance: SolverInstance;
}

// Terms the builders would have to draw as "+ 0" or "0x".
function checkNoZeroTerms(eq: ParsedEquation) {
  const terms = [...eq.left, ...eq.right].flatMap((t) => (isParen(t) ? t.inner : [t]));
  if (terms.some((t) => (isConst(t) && isZero(t.value)) || (isVar(t) && isZero(t.coef))) || [...eq.left, ...eq.right].some((t) => isParen(t) && isZero(t.m))) {
    fail("There's a term equal to 0 in the problem (like + 0 or 0x). Remove it and try again.");
  }
  for (const side of [eq.left, eq.right]) {
    const vars = side.filter(isVar);
    const consts = side.filter(isConst);
    const sum = (fs: Fraction[]) => fs.reduce((a, b) => makeFraction(a.num * b.den + b.num * a.den, a.den * b.den), makeFraction(0, 1));
    for (const name of new Set(vars.map((t) => t.name))) {
      const same = vars.filter((t) => t.name === name);
      if (same.length >= 2 && isZero(sum(same.map((t) => t.coef)))) {
        fail("The variable terms on one side add up to 0, which isn't supported yet. Cancel them out first, then try again.");
      }
    }
    if (consts.length >= 2 && isZero(sum(consts.map((t) => t.value)))) {
      fail("The numbers on one side add up to 0, which isn't supported yet. Cancel them out first, then try again.");
    }
  }
}

const ZERO_ANSWER =
  "Problems whose answer is 0 aren't supported yet. The steps check your work partly by the answer's sign, and 0 doesn't have one. Try a problem with a nonzero answer.";

function routeSingle(eq: ParsedEquation): Built {
  checkNoZeroTerms(eq);
  const v = eq.variables[0];
  const isIneq = eq.relation !== "=";
  const A = eq.linear.coefs[v] ?? makeFraction(0, 1);
  const leftHasVar = sideHasVar(eq.left);
  const rightHasVar = sideHasVar(eq.right);

  // ----- variable on both sides -----
  if (!isZero(A) && isZero(eq.linear.constant)) fail(ZERO_ANSWER);

  if (leftHasVar && rightHasVar) {
    if (isIneq) fail("Inequalities with the variable on both sides aren't supported yet.");
    return routeBothSides(eq, v);
  }

  if (isZero(A)) fail("The variable cancels out of this problem, so there's nothing to solve for.");
  const solution = divFraction(negFraction(eq.linear.constant), A);

  const exprLeft = leftHasVar;
  const E = exprLeft ? eq.left : eq.right;
  const C = exprLeft ? eq.right : eq.left;
  const orientation: Orientation = exprLeft ? "expressionLeft" : "expressionRight";
  const symbol = isIneq ? SYMBOL[eq.relation as Exclude<Relation, "=">] : null;
  if (isIneq && E.some((t) => isVar(t) && t.form === "multiply" && val(t.coef) === -1)) {
    fail(`Inequalities where the variable is just -${v} (a coefficient of -1) aren't supported yet. Equations like -${v} + 5 = 2 work, and so do inequalities like -2${v} + 5 > 1.`);
  }

  const singleConstSide = C.length === 1 && isConst(C[0]);
  if (!singleConstSide) {
    if (isIneq) fail(NOT_YET_INEQUALITY);
    return routeMultiStepNoParen(eq, v);
  }
  const c = (C[0] as ConstTerm).value;

  // ----- one term on the variable side: ax, x/a, (n/d)x, m(nx + p) -----
  if (E.length === 1) {
    const t = E[0];
    if (isParen(t)) return routeParen(t, c, orientation, solution, symbol, v);
    if (!isVar(t)) fail(NOT_YET_GENERAL);
    const term = t as VarTerm;

    if (term.form === "multiply" && val(term.coef) === 1) {
      fail(`This is already solved: ${v} is by itself on one side.`);
    }

    if (term.form === "divide") {
      if (term.negatedNumerator) {
        fail(`A negative sign in front of a division like -${v}/4 isn't supported yet. You can type it as ${v}/(-4) instead, which means the same thing.`);
      }
      if (!isInt(c) || C[0].kind !== "const" || (C[0] as ConstTerm).style !== "int") {
        fail("Division problems with a fraction or decimal on the other side aren't supported yet.");
      }
      const a = term.divisor!;
      const inst = { variant: "multiplicative" as const, a, b: 0, form: "divide" as const, variableFirst: true, orientation, rhs: val(c) };
      return isIneq
        ? { skill: SKILLS.oneStepIneq, instance: buildOneStepIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
        : { skill: SKILLS.oneStepEq, instance: buildOneStepEq({ ...inst, solution: val(solution) }, v) };
    }

    if (term.form === "multiply") {
      const a = term.coef;
      const cleanCoef = a.den === 1 || (a.den === 2 && term.coefStyle === "decimal");
      if (cleanCoef && isInt(solution) && decimalOK(c)) {
        const inst = { variant: "multiplicative" as const, a: val(a), b: 0, form: "multiply" as const, variableFirst: true, orientation, rhs: val(c) };
        return isIneq
          ? { skill: SKILLS.oneStepIneq, instance: buildOneStepIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
          : { skill: SKILLS.oneStepEq, instance: buildOneStepEq({ ...inst, solution: val(solution) }, v) };
      }
      fail(
        isInt(solution)
          ? "Decimal coefficients are only supported when they end in .5 (like 2.5x) right now."
          : "This one-step problem has a fraction or decimal answer, which isn't supported yet. Fraction and decimal answers work for two-step problems like 3x + 2 = 9."
      );
    }

    fail("A one-step problem with a fraction coefficient (like (2/3)x = 4) isn't supported yet. Fraction coefficients work for two-step problems, like (2/3)x + 1 = 5.");
  }

  // ----- variable term + constant: x + b, ax + b, x/a + b, (n/d)x + b -----
  if (E.length === 2 && E.filter(isVar).length === 1 && E.filter(isConst).length === 1) {
    const term = E.find(isVar)!;
    const constTerm = E.find(isConst)!;
    const b = constTerm.value;
    const variableFirst = isVar(E[0]);
    const allInt = isInt(b) && isInt(c) && constTerm.style === "int" && (C[0] as ConstTerm).style === "int";

    // x + b = c  ->  one-step (addition/subtraction)
    if (term.form === "multiply" && val(term.coef) === 1) {
      if (!allInt) fail("One-step addition and subtraction problems with fractions or decimals aren't supported yet.");
      const inst = { variant: "additive" as const, a: 1, b: val(b), form: "multiply" as const, variableFirst, orientation, rhs: val(c) };
      return isIneq
        ? { skill: SKILLS.oneStepIneq, instance: buildOneStepIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
        : { skill: SKILLS.oneStepEq, instance: buildOneStepEq({ ...inst, solution: val(solution) }, v) };
    }

    if (term.form === "divide") {
      if (term.negatedNumerator) {
        fail(`A negative sign in front of a division like -${v}/4 isn't supported yet. You can type it as ${v}/(-4) instead, which means the same thing.`);
      }
      if (!allInt) fail("Division problems with fractions or decimals elsewhere in them aren't supported yet.");
      const inst = { a: term.divisor!, b: val(b), form: "divide" as const, variableFirst, orientation, rhs: val(c) };
      return isIneq
        ? { skill: SKILLS.twoStepIneq, instance: buildTwoStepIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
        : { skill: SKILLS.twoStepEq, instance: buildTwoStepEq({ ...inst, solution: val(solution) }, v) };
    }

    if (term.form === "fraction") {
      if (!allInt) fail("Fraction coefficients are supported when the other numbers are whole numbers.");
      if (!isInt(solution)) fail("Problems with a fraction coefficient AND a fraction answer aren't supported yet.");
      const inst = { n: term.coef.num, d: term.coef.den, b: val(b), variableFirst, orientation, rhs: val(c) };
      return isIneq
        ? { skill: SKILLS.fracIneq, instance: buildFracIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
        : { skill: SKILLS.fracEq, instance: buildFracEq({ ...inst, solution: val(solution) }, v) };
    }

    // multiply form: ax + b = c
    const a = term.coef;
    const halfCoef = a.den === 2 && term.coefStyle === "decimal";
    if ((isInt(a) || halfCoef) && allInt && isInt(solution)) {
      const inst = { a: val(a), b: val(b), form: "multiply" as const, variableFirst, orientation, rhs: val(c) };
      return isIneq
        ? { skill: SKILLS.twoStepIneq, instance: buildTwoStepIneq({ ...inst, boundary: val(solution), origSymbol: symbol! }, v) }
        : { skill: SKILLS.twoStepEq, instance: buildTwoStepEq({ ...inst, solution: val(solution) }, v) };
    }
    if (isInt(a) && term.coefStyle === "int") {
      // A fraction/decimal answer, or fraction/decimal constants.
      if (eq.usesDecimal && (!decimalOK(b) || !decimalOK(c))) fail("Mixing decimals with fractions isn't supported yet.");
      const mode = eq.usesDecimal ? ("decimal" as const) : ("fraction" as const);
      const inst = { mode, a: val(a), b, variableFirst, orientation, rhs: c };
      return isIneq
        ? { skill: SKILLS.nonIntIneq, instance: buildNonIntIneq({ ...inst, boundary: solution, origSymbol: symbol! }, v) }
        : { skill: SKILLS.nonIntEq, instance: buildNonIntEq({ ...inst, solution }, v) };
    }
    fail("Decimal coefficients are only supported when they end in .5 (like 2.5x) and the answer is a whole number.");
  }

  // ----- several terms on the variable side -----
  if (isIneq) fail(NOT_YET_INEQUALITY);
  if (E.some(isParen)) fail("Parentheses combined with other terms on one side are only supported when the variable is on both sides, like 2(x + 3) = 4x - 2.");

  // a1x + a2x + b = c (exactly this order) -> combining like terms
  if (
    E.length === 3 &&
    isVar(E[0]) &&
    isVar(E[1]) &&
    isConst(E[2]) &&
    E.every(isPlainInt) &&
    isPlainInt(C[0]) &&
    !isZero(A) &&
    isInt(solution)
  ) {
    const a1 = val((E[0] as VarTerm).coef);
    const a2 = val((E[1] as VarTerm).coef);
    return {
      skill: SKILLS.combineLike,
      instance: buildCombineLike({ a1, a2, b: val((E[2] as ConstTerm).value), c: val(c), solution: val(solution), orientation }, v),
    };
  }
  return routeMultiStepNoParen(eq, v);
}

function routeParen(
  t: ParenTerm,
  c: Fraction,
  orientation: Orientation,
  solution: Fraction,
  symbol: ComparisonSymbol | null,
  v: string
): Built {
  const [nTerm, pTerm] = t.inner;
  const shapeOK =
    t.inner.length === 2 &&
    isVar(nTerm) &&
    isConst(pTerm) &&
    isPlainInt(nTerm) &&
    isPlainInt(pTerm) &&
    isInt(t.m) &&
    t.mStyle === "int" &&
    Math.abs(val(t.m)) >= 2;
  if (!shapeOK) {
    fail(
      t.inner.length === 2 && isConst(nTerm)
        ? "Parentheses are supported when the variable term comes first inside them, like 3(x + 2)."
        : Math.abs(val(t.m)) < 2 && t.inner.length === 2
        ? "Parentheses with nothing (or just a minus sign) in front aren't supported yet - try distributing the -1 first."
        : "Parentheses are supported in the form m(nx + p), with whole numbers, like -2(3x - 4)."
    );
  }
  if (!isInt(c)) fail("Parentheses problems with a fraction or decimal on the other side aren't supported yet.");
  if (!isInt(solution)) fail(INTEGER_ANSWER_ONLY);
  const inst = { m: val(t.m), n: val((nTerm as VarTerm).coef), p: val((pTerm as ConstTerm).value), q: val(c), orientation };
  return symbol
    ? { skill: SKILLS.parenIneq, instance: buildParenIneq({ ...inst, boundary: val(solution), origSymbol: symbol }, v) }
    : { skill: SKILLS.parenEq, instance: buildParenEq({ ...inst, solution: val(solution) }, v) };
}

// Any mix of whole-number "ax" and "b" terms, up to 3 per side, in any
// order - the general multi-step layout keeps every term where it was.
function routeMultiStepNoParen(eq: ParsedEquation, v: string): Built {
  const all = [...eq.left, ...eq.right];
  if (all.some(isParen)) fail(NOT_YET_GENERAL);
  if (!all.every(isPlainInt)) fail("Problems with several terms are supported with whole-number coefficients and constants only, for now.");
  if (eq.left.length > 3 || eq.right.length > 3) fail("That's a lot of terms! Up to 3 terms on each side are supported right now.");

  const L = sideTotals(eq.left);
  const R = sideTotals(eq.right);
  const aLeft = val(L.coef);
  const aRight = val(R.coef);
  const bLeft = val(L.constant);
  const bRight = val(R.constant);
  if (aLeft === aRight) fail("The variable cancels out of this problem, so it has either no solution or infinitely many. That shape is only supported as ax + b = ax + c right now.");
  const solution = makeFraction(bRight - bLeft, aLeft - aRight);
  if (!isInt(solution)) fail(INTEGER_ANSWER_ONLY);
  // Same rule the multi-step generator follows: with the variable on both
  // sides, the answer gets written into the right side's constant column,
  // so that side needs a constant to begin with.
  if (aLeft !== 0 && aRight !== 0 && bRight === 0) {
    fail("With the variable on both sides, this layout needs a number on the right side too, like 3x + 4 = x + 10. Try moving the terms around so the right side has a constant.");
  }

  const toSide = (side: SurfaceTerm[], finalCoef: number, finalConst: number) => {
    const terms = side.map((t) =>
      isVar(t) ? { type: "x" as const, value: val(t.coef) } : { type: "const" as const, value: val((t as ConstTerm).value) }
    );
    const xi = terms.findIndex((t) => t.type === "x");
    const ci = terms.findIndex((t) => t.type === "const");
    return { terms, finalCoef, finalConst, xAnchorIndex: xi === -1 ? null : xi, constAnchorIndex: ci === -1 ? null : ci };
  };
  return {
    skill: SKILLS.multiNoParen,
    instance: buildMultiNoParen(
      {
        aLeft,
        aRight,
        bLeft,
        bRight,
        solution: val(solution),
        leftSide: toSide(eq.left, aLeft, bLeft),
        rightSide: toSide(eq.right, aRight, bRight),
      },
      v
    ),
  };
}

function routeBothSides(eq: ParsedEquation, v: string): Built {
  const hasParen = [...eq.left, ...eq.right].some(isParen);
  const simple = (side: SurfaceTerm[]) =>
    side.length === 2 && isVar(side[0]) && isConst(side[1]) && side.every(isPlainInt) && !isZero((side[1] as ConstTerm).value);

  if (!hasParen && simple(eq.left) && simple(eq.right)) {
    const aLeft = val((eq.left[0] as VarTerm).coef);
    const aRight = val((eq.right[0] as VarTerm).coef);
    const bLeft = val((eq.left[1] as ConstTerm).value);
    const bRight = val((eq.right[1] as ConstTerm).value);
    if (aLeft === aRight) {
      return {
        skill: SKILLS.bothSidesSpecial,
        instance: buildBothSidesSpecial({ a: aLeft, bLeft, bRight, isIdentity: bLeft === bRight }, v),
      };
    }
    const solution = makeFraction(bRight - bLeft, aLeft - aRight);
    if (!isInt(solution)) fail(INTEGER_ANSWER_ONLY);
    if (Math.abs(aLeft) >= 2 && Math.abs(aRight) >= 2) {
      return { skill: SKILLS.bothSides, instance: buildBothSides({ aLeft, aRight, bLeft, bRight, solution: val(solution) }, v) };
    }
  }
  if (!hasParen) return routeMultiStepNoParen(eq, v);
  return routeMultiStepWithParen(eq, v);
}

function sideSpec(side: SurfaceTerm[]): SideSpec | null {
  const intVal = (f: Fraction) => (isInt(f) ? val(f) : null);
  const parenParts = (t: ParenTerm) => {
    if (t.inner.length !== 2 || !isVar(t.inner[0]) || !isConst(t.inner[1]) || !t.inner.every(isPlainInt)) return null;
    if (!isInt(t.m) || t.mStyle !== "int" || Math.abs(val(t.m)) < 2) return null;
    const p = val((t.inner[1] as ConstTerm).value);
    if (p === 0) return null;
    return { m: val(t.m), n: val((t.inner[0] as VarTerm).coef), p };
  };
  const [t0, t1, t2] = side;

  if (side.length === 2 && isVar(t0) && isConst(t1) && side.every(isPlainInt)) {
    const a = intVal(t0.coef)!;
    const b = intVal(t1.value)!;
    if (a === 0 || b === 0) return null;
    return { shape: "SIMPLE", finalCoef: a, finalConst: b };
  }
  if (side.length === 1 && isParen(t0)) {
    const pp = parenParts(t0);
    return pp && { shape: "PAREN", finalCoef: pp.m * pp.n, finalConst: pp.m * pp.p, ...pp };
  }
  if (side.length === 2 && isParen(t0) && isPlainInt(t1)) {
    const pp = parenParts(t0);
    if (!pp) return null;
    if (isVar(t1)) {
      const k = intVal(t1.coef)!;
      return { shape: "PAREN_PLUS_VAR", finalCoef: pp.m * pp.n + k, finalConst: pp.m * pp.p, ...pp, k };
    }
    const k = intVal((t1 as ConstTerm).value)!;
    return { shape: "PAREN_PLUS_CONST", finalCoef: pp.m * pp.n, finalConst: pp.m * pp.p + k, ...pp, k };
  }
  if (side.length === 3 && side.every(isPlainInt)) {
    if (isVar(t0) && isVar(t1) && isConst(t2)) {
      const a1 = intVal(t0.coef)!;
      const a2 = intVal(t1.coef)!;
      return { shape: "COMBINE_VAR", finalCoef: a1 + a2, finalConst: intVal(t2.value)!, a1, a2 };
    }
    if (isVar(t0) && isConst(t1) && isConst(t2)) {
      const b1 = intVal(t1.value)!;
      const b2 = intVal(t2.value)!;
      return { shape: "COMBINE_CONST", finalCoef: intVal(t0.coef)!, finalConst: b1 + b2, b1, b2 };
    }
  }
  return null;
}

function routeMultiStepWithParen(eq: ParsedEquation, v: string): Built {
  const leftSpec = sideSpec(eq.left);
  const rightSpec = sideSpec(eq.right);
  const SHAPES_HELP =
    "Each side should look like one of: ax + b, m(nx + p), m(nx + p) + kx, m(nx + p) + k, ax + bx + c, or ax + b + c - with the variable term first and whole numbers throughout.";
  if (!leftSpec || !rightSpec) fail(`This parentheses problem is a shape I can't walk through yet. ${SHAPES_HELP}`);
  const L = leftSpec!;
  const R = rightSpec!;
  if (L.finalCoef === 0 || R.finalCoef === 0) fail(`After simplifying, one side has no variable term left, which isn't supported in this layout yet. ${SHAPES_HELP}`);
  if (L.finalConst === 0 || R.finalConst === 0) fail("After simplifying, one side has no constant left, which isn't supported in this layout yet.");
  if (L.finalCoef === R.finalCoef) fail("The variable cancels out of this problem, so it has either no solution or infinitely many. That isn't supported with parentheses yet.");
  const solution = makeFraction(R.finalConst - L.finalConst, L.finalCoef - R.finalCoef);
  if (!isInt(solution)) fail(INTEGER_ANSWER_ONLY);
  return {
    skill: SKILLS.multiWithParen,
    instance: buildMultiWithParen(
      {
        aLeft: L.finalCoef,
        aRight: R.finalCoef,
        bLeft: L.finalConst,
        bRight: R.finalConst,
        solution: val(solution),
        leftSpec: L,
        rightSpec: R,
      },
      v
    ),
  };
}

// ---------- systems of two equations ----------

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
// Same "how much scaling does eliminating this variable take" measure the
// elimination skill uses to decide which variable is easier.
function tierAndWork(p: number, q: number) {
  if (Math.abs(p) === Math.abs(q)) return { tier: 0, work: 1, m1: 1, m2: 1 };
  const lcm = Math.abs(p * q) / gcd(p, q);
  const m1 = lcm / Math.abs(p);
  const m2 = lcm / Math.abs(q);
  return { tier: m1 === 1 || m2 === 1 ? 1 : 2, work: Math.max(m1, m2), m1, m2 };
}

// One method failing (a builder throwing, or its steps failing the
// safety check) shouldn't take the other method down with it.
function tryOption(options: SolveOption[], id: string, label: string, skill: SkillInfo, build: () => SolverInstance) {
  try {
    const instance = build();
    if (blockingIssues(validateInstance(instance, ["x", "y"])).length === 0) options.push({ id, label, skill, instance });
  } catch {
    // leave this method out
  }
}

function routeSystem(eqs: ParsedEquation[]): SolveOption[] {
  for (const e of eqs) if (e.relation !== "=") fail("Systems of inequalities aren't supported yet.");
  for (const e of eqs) checkNoZeroTerms(e);
  const vars = Array.from(new Set(eqs.flatMap((e) => e.variables))).sort();
  if (vars.length !== 2 || vars[0] !== "x" || vars[1] !== "y") {
    fail("Systems are supported with the variables x and y, written as ax + by = c.");
  }
  const rows = eqs.map((e) => {
    const [tx, ty] = e.left;
    const ok =
      e.left.length === 2 &&
      e.right.length === 1 &&
      isVar(tx) &&
      isVar(ty) &&
      tx.name === "x" &&
      ty.name === "y" &&
      isConst(e.right[0]) &&
      [tx, ty, e.right[0]].every(isPlainInt);
    if (!ok) {
      fail("Systems are supported when both equations are written as ax + by = c (x-term first, then y, with a whole number on the right). Rearrange each equation into that form first.");
    }
    return { a: val((tx as VarTerm).coef), b: val((ty as VarTerm).coef), c: val((e.right[0] as ConstTerm).value) };
  });
  const [{ a: a1, b: b1, c: c1 }, { a: a2, b: b2, c: d2 }] = rows;
  const det = a1 * b2 - a2 * b1;
  if (det === 0) fail("These two equations don't cross at exactly one point (they're parallel or the same line), so there isn't a single solution to walk through.");
  const xF = makeFraction(c1 * b2 - d2 * b1, det);
  const yF = makeFraction(a1 * d2 - a2 * c1, det);
  if (!isInt(xF) || !isInt(yF)) fail("This system's solution isn't a pair of whole numbers, which isn't supported yet.");
  const x0 = val(xF);
  const y0 = val(yF);
  if (x0 === 0 || y0 === 0) {
    fail("Systems where x or y equals 0 aren't supported yet. The steps check your work partly by each value's sign, and 0 doesn't have one.");
  }
  for (const r of rows) {
    if (r.c === 0) fail("Systems with 0 on the right side of an equation aren't supported yet.");
  }

  const options: SolveOption[] = [];

  // Substitution - only when exactly one coefficient is +-1, since the
  // first step asks which variable is easiest to isolate and needs a
  // single right answer.
  const unitSpots = [
    { eq: 1 as const, v: "x" as const, coef: a1 },
    { eq: 1 as const, v: "y" as const, coef: b1 },
    { eq: 2 as const, v: "x" as const, coef: a2 },
    { eq: 2 as const, v: "y" as const, coef: b2 },
  ].filter((s) => Math.abs(s.coef) === 1);
  if (unitSpots.length === 1 && (unitSpots[0].eq === 1 ? c1 : d2) !== 0) {
    const u = unitSpots[0];
    tryOption(options, "substitution", "Substitution", SKILLS.substitution, () =>
      buildSubstitutionInstanceTwoTrack({ a1, b1, c1, a2, b2, d2, isolateEq: u.eq, isolateVar: u.v, x0, y0 })
    );
  }

  // Elimination - eliminate whichever variable takes less scaling. The
  // first step asks which variable is easier, so it needs a clear winner.
  const tx = tierAndWork(a1, a2);
  const ty = tierAndWork(b1, b2);
  const easier = (p: typeof tx, q: typeof tx) => p.tier < q.tier || (p.tier === q.tier && p.work < q.work);
  const eliminateVar: "x" | "y" | null = easier(tx, ty) ? "x" : easier(ty, tx) ? "y" : null;
  if (eliminateVar) {
    const t = eliminateVar === "x" ? tx : ty;
    const [p, q] = eliminateVar === "x" ? [a1, a2] : [b1, b2];
    const operation = Math.sign(p) === Math.sign(q) ? ("subtract" as const) : ("add" as const);
    tryOption(options, "elimination", "Elimination", SKILLS.elimination, () =>
      buildEliminationSolverInstance({ a1, b1, c1, a2, b2, d2, eliminateVar, m1: t.m1, m2: t.m2, operation, x0, y0 })
    );
  }

  if (options.length === 0 && (unitSpots.length === 1 || eliminateVar)) fail(SAFETY_MESSAGE);
  if (options.length === 0) {
    fail(
      "I can't pick a single best first step for this system yet: substitution needs exactly one variable with a coefficient of 1 or -1, and elimination needs one variable that's clearly easier to eliminate than the other."
    );
  }
  return options;
}

// ---------- entry point ----------


export function routeInput(raw: string): RouteResult {
  let parsed: ReturnType<typeof parseInput>;
  try {
    parsed = parseInput(raw);
  } catch {
    return { ok: false, error: "I couldn't read that problem. Check it for typos and try again." };
  }
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const eqs = parsed.equations;
  const latex = eqs.length === 1 ? eqs[0].latex : `\\begin{cases} ${eqs.map((e) => e.latex).join(" \\\\ ")} \\end{cases}`;

  try {
    let options: SolveOption[];
    let variables: string[];
    if (eqs.length === 2) {
      options = routeSystem(eqs);
      variables = ["x", "y"];
    } else {
      const eq = eqs[0];
      if (eq.variables.length > 1) {
        fail(`This has ${eq.variables.length} different variables (${eq.variables.join(", ")}). For a system, type two equations separated by a comma or a new line.`);
      }
      const built = routeSingle(eq);
      options = [{ id: built.skill.id, label: built.skill.name, ...built }];
      variables = eq.variables;
    }

    // Safety net: never show a problem whose generated steps look broken.
    const safe = options.filter((o) => blockingIssues(validateInstance(o.instance, variables)).length === 0);
    if (safe.length === 0) return { ok: false, error: SAFETY_MESSAGE, latex };
    return { ok: true, latex, options: safe };
  } catch (e) {
    if (e instanceof NotSupported) return { ok: false, error: e.message, latex };
    // A builder threw on numbers it wasn't designed for - same safety net.
    return { ok: false, error: SAFETY_MESSAGE, latex };
  }
}

// Exposed for tests: route without the safety net, to see raw builder output.
export const __test = { routeSingle, routeSystem };
