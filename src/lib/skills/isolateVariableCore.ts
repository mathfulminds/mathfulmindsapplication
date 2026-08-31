export type VariableForm = "multiply" | "divide"; // "ax" vs "x/a"
export type Orientation = "expressionLeft" | "expressionRight"; // ax+b=c vs c=ax+b

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}
export function randBool(): boolean {
  return Math.random() < 0.5;
}

// Coefficient for the "multiply" form: integer, or a clean half-integer
// (2.5, 3.5, ...). Half-integers are exactly representable in binary
// floating point, so this never introduces rounding artifacts.
export function randMultiplyCoefficient(): number {
  if (Math.random() < 0.3) {
    return (randInt(2, 10) + 0.5) * randSign();
  }
  return randInt(2, 15) * randSign();
}

export const BLANK = "\\phantom{0}";

// The grid's own column gap is a fixed 14px, at the equation area's fixed
// 21px font-size (both confirmed constant across every skill). This is
// the KaTeX equivalent of that same 14px, so the space AFTER a forced
// sign visually matches the space BEFORE it (from the grid gap) exactly,
// instead of the much smaller "\," thin-space, which - at 0.167em, ~3-4px
// - made a sign look glued to the term after it rather than sitting
// centered between both neighbors like a normal +/- should.
export const SIGN_GAP = "\\hspace{0.6667em}";

export function renderConstant(value: number, forceSign: boolean = false, addGap: boolean = true): string {
  // Leading position (forceSign=false): sign always hugs the value
  // tightly, whatever the sign - "-5", "5". A forced sign in a REAL row
  // (addGap=true, the default) needs breathing room either way - "- 5",
  // "+ 5" - so a reader sees it as a term boundary between two visible
  // neighbors. But a standalone cancel-annotation ("what undoes +2?"
  // shown alone, with the rest of that row blank) has no neighbor to
  // separate from - forceSign=true, addGap=false shows the sign (still
  // required - the annotation IS the sign) without adding a gap that
  // would just be misplaced empty space with nothing on either side of it.
  if (!forceSign) return `${value}`;
  const sign = value >= 0 ? "+" : "-";
  const gap = addGap ? SIGN_GAP : "";
  return `${sign}${gap}${Math.abs(value)}`;
}

export function renderMultiplyTerm(
  coef: number,
  symbol: string,
  forceSign: boolean = false,
  addGap: boolean = true
): string {
  const absCoef = Math.abs(coef);
  const core = absCoef === 1 ? symbol : `${absCoef}${symbol}`;
  if (!forceSign) return coef < 0 ? `-${core}` : core;
  const sign = coef >= 0 ? "+" : "-";
  const gap = addGap ? SIGN_GAP : "";
  return `${sign}${gap}${core}`;
}

export function renderDivideTerm(
  divisor: number,
  symbol: string,
  forceSign: boolean = false,
  addGap: boolean = true
): string {
  const core = `\\dfrac{${symbol}}{${divisor}}`;
  return forceSign ? `+${addGap ? SIGN_GAP : ""}${core}` : core;
}

export function signedWord(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Places (expression term 1, expression term 2, lone constant) into the
// correct 4-column positions based on which side of "=" the expression
// sits on. This is the only place orientation is handled - everything
// else just computes values and lets this function position them.
export function assembleRow(
  exprCell1: string,
  exprCell2: string,
  constantCell: string,
  orientation: Orientation,
  eqSymbol: string = "="
): [string, string, string, string] {
  if (orientation === "expressionLeft") {
    return [exprCell1, exprCell2, eqSymbol, constantCell];
  }
  return [constantCell, eqSymbol, exprCell1, exprCell2];
}

// Same idea as assembleRow, for rows that need 3 separate term columns
// instead of 2 (e.g. a kept term, a distributed constant, and a
// distributed variable term, all shown as 3 independent columns rather
// than combining any two of them into one column's text). expressionLeft
// only, since that's the only orientation any current 3-term row needs.
export function assembleRow3(
  exprCell1: string,
  exprCell2: string,
  exprCell3: string,
  constantCell: string,
  eqSymbol: string = "="
): [string, string, string, string, string] {
  return [exprCell1, exprCell2, exprCell3, eqSymbol, constantCell];
}

// For rows where BOTH sides are their own two-term expression (e.g.
// variables-on-both-sides: "3x + 5 = x - 7"), rather than one side being a
// lone constant. Always 5 cells with "=" fixed at index 2 - use with
// SolverInstance.columnCount set to 5, since this collides with the
// standard 4-cell expressionLeft row at the same eqColumnIndex otherwise.
export function assembleBothSides(
  left1: string,
  left2: string,
  right1: string,
  right2: string,
  eqSymbol: string = "="
): [string, string, string, string, string] {
  return [left1, left2, eqSymbol, right1, right2];
}

export function eqColumnIndexFor(orientation: Orientation): 1 | 2 {
  return orientation === "expressionLeft" ? 2 : 1;
}

// Plain-text fraction display for use in MCQ prompts and choice labels,
// which render as ordinary HTML text (not through KaTeX). Using LaTeX
// syntax like "\dfrac{1}{3}" here would show up as literal source code,
// not an actual rendered fraction - this avoids that entirely.
export function plainFraction(numerator: number, denominator: number): string {
  if (numerator < 0) return `-${Math.abs(numerator)}/${denominator}`;
  return `${numerator}/${denominator}`;
}

export function plainReciprocal(n: number, d: number): string {
  if (n < 0) return `-${d}/${Math.abs(n)}`;
  return `${d}/${n}`;
}

export function renderFractionTerm(
  n: number,
  d: number,
  symbol: string,
  forceSign: boolean = false,
  addGap: boolean = true
): string {
  const abs = Math.abs(n);
  const frac = `\\dfrac{${abs}}{${d}}${symbol}`;
  if (!forceSign) return n < 0 ? `-${frac}` : frac;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${addGap ? SIGN_GAP : ""}${frac}`;
}

// Reciprocal of n/d, rendered as its own signed fraction (not simplified),
// e.g. reciprocal of -2/3 is displayed as -3/2, not as a decimal.
export function renderReciprocal(n: number, d: number): string {
  if (n < 0) return `-\\dfrac{${d}}{${Math.abs(n)}}`;
  return `\\dfrac{${d}}{${n}}`;
}
