// Exact fraction arithmetic. Everything here works on integer numerator/
// denominator pairs - never floating point - so equality checks and
// simplification are always exact, the same guarantee our integer-based
// skills have relied on all along.

export interface Fraction {
  num: number; // integer, carries the sign
  den: number; // positive integer, always >= 1
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a === 0 ? 1 : a;
}

// Always constructs in fully reduced form, with the sign normalized onto
// the numerator (denominator is always positive).
export function makeFraction(num: number, den: number): Fraction {
  if (den === 0) throw new Error("Fraction denominator cannot be zero");
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export function fromInt(n: number): Fraction {
  return { num: n, den: 1 };
}

export function addFraction(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subFraction(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mulFraction(a: Fraction, b: Fraction): Fraction {
  return makeFraction(a.num * b.num, a.den * b.den);
}

export function divFraction(a: Fraction, b: Fraction): Fraction {
  if (b.num === 0) throw new Error("Division by zero fraction");
  return makeFraction(a.num * b.den, a.den * b.num);
}

export function negFraction(a: Fraction): Fraction {
  return { num: -a.num, den: a.den };
}

export function isInteger(f: Fraction): boolean {
  return f.den === 1;
}

export function fractionEquals(a: Fraction, b: Fraction): boolean {
  // both already in reduced form by construction, so a direct compare
  // after reduction is exact and sufficient
  const ra = makeFraction(a.num, a.den);
  const rb = makeFraction(b.num, b.den);
  return ra.num === rb.num && ra.den === rb.den;
}

// A fraction terminates as a decimal iff its reduced denominator's only
// prime factors are 2 and 5.
export function terminatesAsDecimal(f: Fraction): boolean {
  let d = f.den;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

export interface DecimalExpansion {
  sign: 1 | -1;
  integerPart: number;
  nonRepeating: string;
  repeating: string; // empty string means it terminates cleanly
}

// Standard long-division algorithm: track which remainders have been seen
// and at what digit position. When a remainder repeats, everything since
// its first occurrence is the repeating cycle.
export function decimalExpansion(f: Fraction): DecimalExpansion {
  const sign: 1 | -1 = f.num < 0 ? -1 : 1;
  const absNum = Math.abs(f.num);
  const den = f.den;
  const integerPart = Math.floor(absNum / den);
  let remainder = absNum % den;
  const digits: string[] = [];
  const seenAt = new Map<number, number>();
  let repeatStart = -1;

  while (remainder !== 0) {
    if (seenAt.has(remainder)) {
      repeatStart = seenAt.get(remainder)!;
      break;
    }
    seenAt.set(remainder, digits.length);
    remainder *= 10;
    digits.push(String(Math.floor(remainder / den)));
    remainder = remainder % den;
  }

  if (repeatStart === -1) {
    return { sign, integerPart, nonRepeating: digits.join(""), repeating: "" };
  }
  return {
    sign,
    integerPart,
    nonRepeating: digits.slice(0, repeatStart).join(""),
    repeating: digits.slice(repeatStart).join(""),
  };
}

export function decimalExpansionToKatex(f: Fraction, forceSign: boolean = false): string {
  const { sign, integerPart, nonRepeating, repeating } = decimalExpansion(f);
  const signStr = sign < 0 ? "-" : forceSign ? "+\\,": "";
  let body = `${integerPart}`;
  if (nonRepeating.length > 0 || repeating.length > 0) {
    body += "." + nonRepeating;
    if (repeating.length > 0) {
      body += `\\overline{${repeating}}`;
    }
  }
  return `${signStr}${body}`;
}

// Markers around the repeating digits, and separately around the whole
// number - rare control characters that will never appear naturally.
// The rendering layer splits on the OUTER pair first (NUMBER_START/END)
// to find where a number sits inside a larger sentence (e.g. an MCQ
// choice like "Subtracting 8.18 from both sides"), rendering everything
// outside it as plain text in the normal UI font, and everything inside
// it through REAL KaTeX - guaranteeing a perfect size/font match with the
// rest of the math, rather than guessing a font-size multiplier. Within
// that, the INNER pair (OVERLINE_START/END) marks just the repeating
// digits, which get wrapped in a real CSS border-top instead of KaTeX's
// own \overline command (which has a documented rendering bug).
export const NUMBER_START = "\u0003";
export const NUMBER_END = "\u0004";
export const OVERLINE_START = "\u0001";
export const OVERLINE_END = "\u0002";

export function decimalExpansionToPlainText(f: Fraction, forceSign: boolean = false): string {
  const { sign, integerPart, nonRepeating, repeating } = decimalExpansion(f);
  const signStr = sign < 0 ? "-" : forceSign ? "+" : "";
  let body = `${integerPart}`;
  if (nonRepeating.length > 0 || repeating.length > 0) {
    body += "." + nonRepeating;
    if (repeating.length > 0) {
      body += `${OVERLINE_START}${repeating}${OVERLINE_END}`;
    }
  }
  return `${NUMBER_START}${signStr}${body}${NUMBER_END}`;
}

// A realistic wrong answer: the correct leading digits, but truncated with
// no bar notation at all - as if the student gave up and rounded instead
// of recognizing the repeat. Only meaningful when the value actually
// repeats.
export function decimalExpansionTruncatedKatex(f: Fraction, extraDigits: number = 2): string {
  const { sign, integerPart, nonRepeating, repeating } = decimalExpansion(f);
  const signStr = sign < 0 ? "-" : "";
  let digitsShown = nonRepeating;
  if (repeating.length > 0) {
    let extra = "";
    while (extra.length < extraDigits) extra += repeating;
    digitsShown += extra.slice(0, extraDigits);
  }
  const body = digitsShown.length > 0 ? `${integerPart}.${digitsShown}` : `${integerPart}`;
  return `${signStr}${body}`;
}

// For TERMINATING decimals specifically (no repeat to forget) - a
// plausible off-by-one arithmetic slip in the last digit, guaranteed to
// differ from the correct value.
export function decimalOffByOneKatex(f: Fraction): string {
  const { sign, integerPart, nonRepeating } = decimalExpansion(f);
  const signStr = sign < 0 ? "-" : "";
  if (nonRepeating.length === 0) {
    return `${signStr}${integerPart + 1}`;
  }
  const lastDigit = parseInt(nonRepeating[nonRepeating.length - 1], 10);
  const newLastDigit = lastDigit === 9 ? lastDigit - 1 : lastDigit + 1;
  const newDigits = nonRepeating.slice(0, -1) + String(newLastDigit);
  return `${signStr}${integerPart}.${newDigits}`;
}

// KaTeX rendering of a reduced fraction. Whole numbers render as plain
// integers, not as a fraction with denominator 1.
export function fractionToKatex(f: Fraction, forceSign: boolean = false): string {
  if (f.den === 1) {
    if (forceSign && f.num >= 0) return `+\\,${f.num}`;
    return `${f.num}`;
  }
  const abs = Math.abs(f.num);
  const core = `\\dfrac{${abs}}{${f.den}}`;
  if (f.num < 0) return `-${core}`;
  return forceSign ? `+\\,${core}` : core;
}

// Plain-text rendering for MCQ prompt/choice strings (wrapped in $...$
// by the caller when real KaTeX is wanted there instead).
export function fractionToPlainText(f: Fraction): string {
  if (f.den === 1) return `${f.num}`;
  return f.num < 0 ? `-${Math.abs(f.num)}/${f.den}` : `${f.num}/${f.den}`;
}
