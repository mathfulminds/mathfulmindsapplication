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

export function renderConstant(value: number, forceSign: boolean = false): string {
  if (forceSign && value >= 0) return `+\\,${value}`;
  return `${value}`;
}

export function renderMultiplyTerm(
  coef: number,
  symbol: string,
  forceSign: boolean = false
): string {
  let core: string;
  if (coef === 1) core = symbol;
  else if (coef === -1) core = `-${symbol}`;
  else core = `${coef}${symbol}`;
  if (forceSign && coef >= 0) core = `+\\,${core}`;
  return core;
}

export function renderDivideTerm(
  divisor: number,
  symbol: string,
  forceSign: boolean = false
): string {
  const core = `\\dfrac{${symbol}}{${divisor}}`;
  return forceSign ? `+\\,${core}` : core;
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
  forceSign: boolean = false
): string {
  const abs = Math.abs(n);
  const frac = `\\dfrac{${abs}}{${d}}${symbol}`;
  if (n < 0) return `-${frac}`;
  return forceSign ? `+\\,${frac}` : frac;
}

// Reciprocal of n/d, rendered as its own signed fraction (not simplified),
// e.g. reciprocal of -2/3 is displayed as -3/2, not as a decimal.
export function renderReciprocal(n: number, d: number): string {
  if (n < 0) return `-\\dfrac{${d}}{${Math.abs(n)}}`;
  return `\\dfrac{${d}}{${n}}`;
}
