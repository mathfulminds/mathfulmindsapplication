// Parses a student-entered equation, inequality, or system - typed as
// plain text ("3x + 5 = 11", "x/4 >= -2") OR as LaTeX ("\frac{x}{4}
// \geq -2", which is what photo/OCR services return) - into a structure
// that remembers HOW each term was written, not just its value.
//
// That second part matters: every skill's builder renders the problem
// from numbers, but it also needs to know surface details like whether
// the variable came first ("x + 5" vs "5 + x"), whether a coefficient
// was written as division ("x/4") or as a fraction ("(1/4)x"), and which
// side of the "=" the expression sits on. Re-deriving the problem from
// its simplified value alone would silently reorder or rewrite what the
// student typed - which breaks the "never reorder terms" principle.

import type { Mono } from "@/lib/skills/literalEquations";
import type { PowerProblem } from "@/lib/skills/squareCubeRoots";
import type { AbsProblem } from "@/lib/skills/absoluteValue";
import type { AbsIneqProblem } from "@/lib/skills/absoluteValueInequalities";
import type { SqProblem } from "@/lib/skills/quadraticsSquareRoots";
import type { FactorProblem } from "@/lib/skills/quadraticsFactoring";
import type { Fraction } from "@/lib/skills/fraction";
import { makeFraction, fromInt, addFraction, mulFraction, divFraction, negFraction } from "@/lib/skills/fraction";

// ---------- public types ----------

export type Relation = "=" | "<" | ">" | "<=" | ">=";
export type NumStyle = "int" | "decimal" | "fraction";

export interface ConstTerm {
  kind: "const";
  value: Fraction;
  style: NumStyle;
}

export interface VarTerm {
  kind: "var";
  name: string;
  // The term's full signed coefficient, e.g. -x/4 -> -1/4, (2/3)x -> 2/3.
  coef: Fraction;
  // multiply: "3x", "-x", "2.5x"   divide: "x/4", "x/-4", "-x/4"
  // fraction: "(2/3)x", "2x/3", "\frac{2}{3}x"
  form: "multiply" | "divide" | "fraction";
  coefStyle: NumStyle;
  // divide form only: the divisor exactly as written (sign included),
  // and whether the minus sat on the numerator/outside ("-x/4") rather
  // than on the divisor ("x/-4").
  divisor?: number;
  negatedNumerator?: boolean;
}

export interface ParenTerm {
  kind: "paren";
  // The multiplier outside the parentheses, e.g. 3(x+2) -> 3, -(x+2) -> -1.
  m: Fraction;
  mStyle: NumStyle;
  inner: (ConstTerm | VarTerm)[];
}

export type SurfaceTerm = ConstTerm | VarTerm | ParenTerm;

export interface LinearForm {
  coefs: Record<string, Fraction>; // variable name -> total coefficient
  constant: Fraction;
}

export interface ParsedEquation {
  left: SurfaceTerm[];
  right: SurfaceTerm[];
  relation: Relation;
  variables: string[]; // sorted, unique
  // left - right, fully simplified: sum(coefs * var) + constant (relation) 0
  linear: LinearForm;
  usesDecimal: boolean;
  usesFraction: boolean;
  latex: string; // clean LaTeX of what was understood, for the preview
  // Set when the problem is a proportion - one fraction = one fraction of
  // positive whole numbers, with the variable as one of the four numbers
  // (which may be a denominator, e.g. 2/3 = 16/x). The variable's spot is
  // null. left/right/linear are left empty for these.
  proportion?: { TL: number | null; BL: number | null; TR: number | null; BR: number | null };
  // Set for percent problems, solved with is/of = %/100. Exactly one of
  // isN / ofN / pct is null (the unknown). Typed as a sentence ("What is
  // 25% of 40?") or an equation ("x = 25% * 40", "25%x = 10").
  percent?: PercentProblem;
  // Set for a "sandwich" compound inequality, like -3 < 2x + 1 <= 7. The
  // middle's terms are in `left` (right is empty), `relation` is the first
  // sign, and linear is the middle on its own.
  sandwich?: { left: Fraction; right: Fraction; relation2: Relation };
  // Set for a formula with more than one letter (a literal equation, like
  // P = 2l + 2w): each side as terms of a number times letters.
  literal?: { left: Mono[]; right: Mono[] };
  // Set for x² / x³ equations (square and cube roots): a·x^n + b = rhs.
  power?: PowerProblem;
  // Set for absolute value equations: a·|m x + n| + b = c.
  abs?: AbsProblem;
  // Set for an absolute value inequality (|x - 3| < 5).
  absIneq?: AbsIneqProblem;
  // Set for a squared expression set equal to a number ((x - 3)² = 16).
  sqRoot?: SqProblem;
  // Set for x² + bx + c = 0 (factoring).
  factor?: FactorProblem;
}

export interface PercentProblem {
  isN: Fraction | null;
  ofN: Fraction | null;
  pct: Fraction | null;
  phrasing: "whatIs" | "whatNumberIs" | "whatPercent" | "isOfWhat";
}

export type ParseResult =
  // join: two inequalities written with "or" / "and" between them (a
  // compound inequality, not a system).
  | { ok: true; equations: ParsedEquation[]; join?: "and" | "or"; target?: string }
  | { ok: false; error: string };

// ---------- errors ----------

class InputError extends Error {}

// ---------- normalization ----------

const SEPARATOR = "\n";
const OR_SEPARATOR = "\u0007";

function normalize(raw: string): string {
  let s = raw;
  // Unicode symbols students (and some OCR services) produce.
  s = s
    .replace(/[−‒–—﹣－]/g, "-")
    .replace(/[×·⋅∙•]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[≤⩽]/g, "<=")
    .replace(/[≥⩾]/g, ">=")
    .replace(/≠/g, "\\neq")
    .replace(/[ \t]/g, " ");

  // LaTeX environments that wrap systems of equations (cases, aligned,
  // array) - their row breaks become equation separators.
  s = s.replace(/\\begin\{array\}\{[^}]*\}/g, "");
  s = s.replace(/\\(begin|end)\{[a-zA-Z*]+\}/g, "");
  s = s.replace(/\\\\/g, SEPARATOR);
  s = s.replace(/\\text\{\s*and\s*\}/g, SEPARATOR);
  s = s.replace(/\\(text|mathrm|mathit|mathbf|operatorname)\{([^}]*)\}/g, "$2");
  // "x < 2 or x > 5" - a compound inequality
  // (the editor drops spaces, so "x<2orx>5" too - "or" is never math)
  s = s.replace(/(?<![a-zA-Z\\])or(?=[a-zA-Z]?(?![a-zA-Z]))/gi, OR_SEPARATOR);

  // Pure-presentation LaTeX that carries no math meaning.
  // A word problem whose "?" the editor turned into the start of a fraction
  // ("...of 40?" -> 40 over an empty box): read it as the question mark.
  if (/[a-zA-Z]{2,}/.test(s.replace(/\\[a-zA-Z]+/g, " "))) {
    s = s.replace(/\\frac\{([^{}]*)\}\{\\placeholder(?:\[[^\]]*\])?\{\}\}\s*$/, "$1?");
  }
  // An empty box the student hasn't filled in yet (from the math editor).
  if (/\\placeholder/.test(s)) {
    throw new InputError("There's still an empty box in the problem. Fill it in (or delete it), then try again.");
  }
  s = s.replace(/\\mleft|\\mright|\\left|\\right|\\displaystyle|\\big|\\Big|\\bigg|\\Bigg/g, "");
  s = s.replace(/\\(lvert|rvert|vert|mid)(?![a-zA-Z])/g, "|");
  s = s.replace(/\\%/g, "%");
  // "15% of x" -> "15% * x"
  s = s.replace(/%\s*of\s*/gi, "%*");
  s = s.replace(/\\[{}]/g, ""); // \{ \} - the big brace in front of a system
  s = s.replace(/\\(quad|qquad)/g, " ");
  s = s.replace(/\\[,;:! ]/g, " ");
  s = s.replace(/[$&~]/g, " ");

  // LaTeX operators and relations -> plain equivalents.
  s = s.replace(/\\(cdot|times|ast)(?![a-zA-Z])/g, "*");
  s = s.replace(/\\div(?![a-zA-Z])/g, "/");
  s = s.replace(/\\(leqslant|leq|le)(?![a-zA-Z])/g, "<=");
  s = s.replace(/\\(geqslant|geq|ge)(?![a-zA-Z])/g, ">=");
  s = s.replace(/\\lt(?![a-zA-Z])/g, "<");
  s = s.replace(/\\gt(?![a-zA-Z])/g, ">");
  s = s.replace(/\\(dfrac|tfrac|cfrac)(?![a-zA-Z])/g, "\\frac");
  // \frac12 shorthand -> \frac{1}{2}
  s = s.replace(/\\frac\s*([0-9a-zA-Z])\s*([0-9a-zA-Z])/g, "\\frac{$1}{$2}");

  s = s.replace(/=</g, "<=").replace(/=>/g, ">=");

  // Plain-text system separators: newlines, semicolons, the word "and",
  // and commas (no decimal-comma support - "2,5" is not a number here).
  s = s.replace(/(?<![a-zA-Z\\])and(?=[a-zA-Z]?(?![a-zA-Z]))/gi, SEPARATOR);
  s = s.replace(/[;,]/g, SEPARATOR);
  return s;
}

// ---------- tokenizer ----------

type Token =
  | { t: "num"; raw: string }
  | { t: "var"; name: string }
  | { t: "op"; op: "+" | "-" | "*" | "/" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "lbrace" }
  | { t: "rbrace" }
  | { t: "frac" }
  | { t: "rel"; rel: Relation };

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      if ((raw.match(/\./g) ?? []).length > 1 || raw === ".") {
        throw new InputError(`"${raw}" isn't a number I can read.`);
      }
      tokens.push({ t: "num", raw });
      i = j;
      continue;
    }
    if (c === "\\") {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const cmd = s.slice(i + 1, j);
      if (cmd === "frac") {
        tokens.push({ t: "frac" });
        i = j;
        continue;
      }
      if (cmd === "neq" || cmd === "ne") throw new InputError("\"Not equal to\" (≠) problems aren't supported yet. Right now you can solve linear equations, linear inequalities, and systems of two linear equations.");
      if (cmd === "sqrt") throw new InputError("Square roots and other roots aren't supported yet. Right now you can solve linear equations, linear inequalities, and systems of two linear equations.");
      if (cmd === "pi") {
        // π: allowed in formulas (literal equations), checked below otherwise
        tokens.push({ t: "var", name: "π" });
        i = j;
        continue;
      }
      if (cmd === "pm" || cmd === "mp") throw new InputError("The ± symbol isn't supported here.");
      throw new InputError(cmd ? `I don't recognize "\\${cmd}".` : "There's a stray backslash in the problem.");
    }
    if (/[a-zA-Z]/.test(c)) {
      tokens.push({ t: "var", name: c });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", op: c });
      i++;
      continue;
    }
    if (c === "(" || c === "[") {
      tokens.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")" || c === "]") {
      tokens.push({ t: "rparen" });
      i++;
      continue;
    }
    if (c === "{") {
      tokens.push({ t: "lbrace" });
      i++;
      continue;
    }
    if (c === "}") {
      tokens.push({ t: "rbrace" });
      i++;
      continue;
    }
    if (c === "<" || c === ">") {
      if (s[i + 1] === "=") {
        tokens.push({ t: "rel", rel: c === "<" ? "<=" : ">=" });
        i += 2;
      } else {
        tokens.push({ t: "rel", rel: c });
        i++;
      }
      continue;
    }
    if (c === "=") {
      tokens.push({ t: "rel", rel: "=" });
      i += s[i + 1] === "=" ? 2 : 1; // tolerate "=="
      continue;
    }
    if (c === "^") throw new InputError("Exponents aren't supported yet. Right now you can solve linear equations, linear inequalities, and systems of two linear equations.");
    if (c === "|") throw new InputError("Absolute value isn't supported yet. Right now you can solve linear equations, linear inequalities, and systems of two linear equations.");
    if (c === "!") throw new InputError("\"Not equal to\" problems aren't supported yet.");
    throw new InputError(`I don't recognize the symbol "${c}".`);
  }
  return tokens;
}

// ---------- AST ----------

type Node =
  | { t: "num"; value: Fraction; style: "int" | "decimal"; raw: string }
  | { t: "var"; name: string }
  | { t: "neg"; x: Node }
  | { t: "add"; terms: { sign: 1 | -1; node: Node }[] }
  | { t: "mul"; factors: Node[]; explicit: boolean }
  | { t: "div"; num: Node; den: Node; style: "slash" | "frac" }
  | { t: "group"; x: Node; visible: boolean };

function parseNumber(raw: string): { value: Fraction; style: "int" | "decimal" } {
  if (!raw.includes(".")) return { value: fromInt(parseInt(raw, 10)), style: "int" };
  const [whole, frac = ""] = raw.split(".");
  if (frac.length === 0) return { value: fromInt(parseInt(whole || "0", 10)), style: "int" };
  if (frac.length > 6) throw new InputError(`${raw} has too many decimal places.`);
  const den = Math.pow(10, frac.length);
  const num = parseInt(whole || "0", 10) * den + parseInt(frac, 10);
  return { value: makeFraction(num, den), style: "decimal" };
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  private expect(t: Token["t"], what: string) {
    const tok = this.next();
    if (!tok || tok.t !== t) throw new InputError(`Something's missing - I expected ${what}.`);
    return tok;
  }
  atEnd() {
    return this.pos >= this.tokens.length;
  }

  parseRelation(): { left: Node; relation: Relation; right: Node; relation2?: Relation; right2?: Node } {
    if (this.atEnd()) throw new InputError("Type an equation or inequality to get started.");
    const left = this.parseExpr();
    const relTok = this.next();
    if (!relTok) throw new InputError("I need an equals sign (or <, >, ≤, ≥) to know what to solve.");
    if (relTok.t !== "rel") throw new InputError("Something in the problem doesn't fit together - check for a missing operator or parenthesis.");
    if (this.atEnd()) throw new InputError("There's nothing on the right side of the equals sign.");
    const right = this.parseExpr();
    const after = this.peek();
    if (after && after.t === "rel") {
      // A compound inequality written in one line: 1 < 2x + 3 < 9.
      this.next();
      if (this.atEnd()) throw new InputError("There's nothing after the second inequality sign.");
      const right2 = this.parseExpr();
      const more = this.peek();
      if (more && more.t === "rel") throw new InputError("I can only handle up to two inequality signs in a row.");
      if (more) throw new InputError("Something in the problem doesn't fit together - check for a missing operator or parenthesis.");
      return { left, relation: relTok.rel, right, relation2: after.rel, right2 };
    }
    if (after) throw new InputError("Something in the problem doesn't fit together - check for a missing operator or parenthesis.");
    return { left, relation: relTok.rel, right };
  }

  parseExpr(): Node {
    const terms: { sign: 1 | -1; node: Node }[] = [];
    let sign: 1 | -1 = 1;
    let tok = this.peek();
    // Leading sign(s): "-x", "+5", even "--3" (collapses).
    while (tok && tok.t === "op" && (tok.op === "+" || tok.op === "-")) {
      if (tok.op === "-") sign = (sign === 1 ? -1 : 1) as 1 | -1;
      this.next();
      tok = this.peek();
    }
    terms.push({ sign, node: this.parseTerm() });
    tok = this.peek();
    while (tok && tok.t === "op" && (tok.op === "+" || tok.op === "-")) {
      this.next();
      let s: 1 | -1 = tok.op === "-" ? -1 : 1;
      // "x + -3" and "x - -3" are legal to type; fold the extra sign in.
      let more = this.peek();
      while (more && more.t === "op" && (more.op === "+" || more.op === "-")) {
        if (more.op === "-") s = (s === 1 ? -1 : 1) as 1 | -1;
        this.next();
        more = this.peek();
      }
      terms.push({ sign: s, node: this.parseTerm() });
      tok = this.peek();
    }
    if (terms.length === 1) return terms[0].sign === 1 ? terms[0].node : { t: "neg", x: terms[0].node };
    return { t: "add", terms };
  }

  private startsFactor(tok: Token | undefined): boolean {
    return !!tok && (tok.t === "num" || tok.t === "var" || tok.t === "lparen" || tok.t === "lbrace" || tok.t === "frac");
  }

  parseTerm(): Node {
    let node = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      if (tok && tok.t === "op" && tok.op === "*") {
        this.next();
        node = mul(node, this.parseSignedFactor(), true);
      } else if (tok && tok.t === "op" && tok.op === "/") {
        this.next();
        node = { t: "div", num: node, den: this.parseSignedFactor(), style: "slash" };
      } else if (this.startsFactor(tok)) {
        node = mul(node, this.parseFactor(), false);
      } else {
        return node;
      }
    }
  }

  // After "*" or "/", a sign is allowed: "x/-4", "3*-2".
  private parseSignedFactor(): Node {
    const tok = this.peek();
    if (tok && tok.t === "op" && (tok.op === "-" || tok.op === "+")) {
      this.next();
      const f = this.parseSignedFactor();
      return tok.op === "-" ? { t: "neg", x: f } : f;
    }
    return this.parseFactor();
  }

  parseFactor(): Node {
    const tok = this.next();
    if (!tok) throw new InputError("The problem ends too early - is something missing at the end?");
    switch (tok.t) {
      case "num": {
        const { value, style } = parseNumber(tok.raw);
        return { t: "num", value, style, raw: tok.raw };
      }
      case "var":
        return { t: "var", name: tok.name };
      case "lparen": {
        if (this.peek()?.t === "rparen") throw new InputError("There's an empty pair of parentheses.");
        const x = this.parseExpr();
        const close = this.next();
        if (!close || close.t !== "rparen") throw new InputError("A parenthesis is opened but never closed.");
        return { t: "group", x, visible: true };
      }
      case "lbrace": {
        const x = this.parseExpr();
        this.expect("rbrace", "a closing }");
        return { t: "group", x, visible: false };
      }
      case "frac": {
        this.expect("lbrace", "{ after \\frac");
        const num = this.parseExpr();
        this.expect("rbrace", "a closing }");
        this.expect("lbrace", "a second { for the denominator");
        const den = this.parseExpr();
        this.expect("rbrace", "a closing }");
        return { t: "div", num, den, style: "frac" };
      }
      case "op":
        if (tok.op === "-" || tok.op === "+") {
          // Sign directly inside a product, e.g. "2(-3)" is handled by
          // the paren case; this covers "-(...)" mid-term.
          const f = this.parseFactor();
          return tok.op === "-" ? { t: "neg", x: f } : f;
        }
        throw new InputError(`There's a "${tok.op}" in a spot where a number or variable should be.`);
      case "rparen":
        throw new InputError("A closing parenthesis doesn't have a matching opening one.");
      case "rbrace":
        throw new InputError("There's an unmatched }.");
      case "rel":
        throw new InputError("There's nothing on one side of the equals sign.");
    }
  }
}

function mul(a: Node, b: Node, explicit: boolean): Node {
  if (a.t === "mul" && a.explicit === explicit) return { t: "mul", factors: [...a.factors, b], explicit };
  return { t: "mul", factors: [a, b], explicit };
}

// ---------- linear evaluation ----------

class LinearError extends InputError {}

interface Lin {
  coefs: Record<string, Fraction>;
  c: Fraction;
}

function linConst(c: Fraction): Lin {
  return { coefs: {}, c };
}
function isConstLin(l: Lin): boolean {
  return Object.values(l.coefs).every((f) => f.num === 0);
}
function linAdd(a: Lin, b: Lin, sign: 1 | -1): Lin {
  const coefs: Record<string, Fraction> = { ...a.coefs };
  for (const [k, v] of Object.entries(b.coefs)) {
    const sv = sign === 1 ? v : negFraction(v);
    coefs[k] = coefs[k] ? addFraction(coefs[k], sv) : sv;
  }
  return { coefs, c: addFraction(a.c, sign === 1 ? b.c : negFraction(b.c)) };
}
function linScale(a: Lin, k: Fraction): Lin {
  const coefs: Record<string, Fraction> = {};
  for (const [name, v] of Object.entries(a.coefs)) coefs[name] = mulFraction(v, k);
  return { coefs, c: mulFraction(a.c, k) };
}

function linearize(n: Node): Lin {
  switch (n.t) {
    case "num":
      return linConst(n.value);
    case "var":
      return { coefs: { [n.name]: fromInt(1) }, c: fromInt(0) };
    case "neg":
      return linScale(linearize(n.x), fromInt(-1));
    case "group":
      return linearize(n.x);
    case "add":
      return n.terms.reduce<Lin>((acc, t) => linAdd(acc, linearize(t.node), t.sign), linConst(fromInt(0)));
    case "mul": {
      let acc = linearize(n.factors[0]);
      for (const f of n.factors.slice(1)) {
        const b = linearize(f);
        if (isConstLin(acc)) acc = linScale(b, acc.c);
        else if (isConstLin(b)) acc = linScale(acc, b.c);
        else throw new LinearError("This has a variable multiplied by a variable (like x·x or xy), so it isn't linear. Only linear equations and inequalities are supported right now.");
      }
      return acc;
    }
    case "div": {
      const num = linearize(n.num);
      const den = linearize(n.den);
      if (!isConstLin(den)) throw new LinearError("Variables in a denominator aren't supported yet.");
      if (den.c.num === 0) throw new LinearError("This divides by zero.");
      return linScale(num, divFraction(fromInt(1), den.c));
    }
  }
}

// ---------- surface classification ----------

class UnsupportedShape extends InputError {}

function unwrapInvisible(n: Node): Node {
  while (n.t === "group" && !n.visible) n = n.x;
  return n;
}

function hasVar(n: Node): boolean {
  switch (n.t) {
    case "num":
      return false;
    case "var":
      return true;
    case "neg":
    case "group":
      return hasVar(n.x);
    case "add":
      return n.terms.some((t) => hasVar(t.node));
    case "mul":
      return n.factors.some(hasVar);
    case "div":
      return hasVar(n.num) || hasVar(n.den);
  }
}

// A plain signed number: 5, -5, (5), (-5), 2.5. Returns null otherwise.
function asSimpleNumber(n: Node): { value: Fraction; style: "int" | "decimal" } | null {
  n = unwrapInvisible(n);
  if (n.t === "num") return { value: n.value, style: n.style };
  if (n.t === "neg") {
    const inner = asSimpleNumber(n.x);
    return inner ? { value: negFraction(inner.value), style: inner.style } : null;
  }
  if (n.t === "group") return asSimpleNumber(n.x);
  return null;
}

// A plain fraction of two integers: 2/3, \frac{2}{3}, (2/3), -2/3.
function asSimpleFraction(n: Node): Fraction | null {
  n = unwrapInvisible(n);
  if (n.t === "group") return asSimpleFraction(n.x);
  if (n.t === "neg") {
    const f = asSimpleFraction(n.x);
    return f ? negFraction(f) : null;
  }
  if (n.t !== "div") return null;
  const a = asSimpleNumber(n.num);
  const b = asSimpleNumber(n.den);
  if (!a || !b || a.style !== "int" || b.style !== "int" || b.value.num === 0) return null;
  return divFraction(a.value, b.value);
}

function asVar(n: Node): string | null {
  n = unwrapInvisible(n);
  return n.t === "var" ? n.name : null;
}

const UNSUPPORTED_TERM =
  "One of the terms is written in a way I can't follow step by step yet. Try writing each term like 3x, x/4, (2/3)x, 5, or 3(x + 2).";

function classifyTerm(sign: 1 | -1, node: Node, allowParen: boolean): SurfaceTerm {
  node = unwrapInvisible(node);
  // Fold leading negations into the sign.
  while (node.t === "neg") {
    sign = (sign === 1 ? -1 : 1) as 1 | -1;
    node = unwrapInvisible(node.x);
  }
  const s = fromInt(sign);

  if (!hasVar(node)) {
    const num = asSimpleNumber(node);
    if (num) return { kind: "const", value: mulFraction(num.value, s), style: num.style };
    const frac = asSimpleFraction(node);
    if (frac) return { kind: "const", value: mulFraction(frac, s), style: "fraction" };
    throw new UnsupportedShape("Some of the numbers are written as a calculation (like 3·4 or (2 + 5)). Work those out first, then type the simpler version.");
  }

  // x
  const v = asVar(node);
  if (v) return { kind: "var", name: v, coef: s, form: "multiply", coefStyle: "int" };

  if (node.t === "mul" && node.factors.length === 2) {
    const [f0, f1] = node.factors;
    const name = asVar(f1);
    if (name) {
      // 3x, 2.5x, (3)x
      const num = asSimpleNumber(f0);
      if (num) return { kind: "var", name, coef: mulFraction(num.value, s), form: "multiply", coefStyle: num.style };
      // (2/3)x, \frac{2}{3}x, 2/3x
      const frac = asSimpleFraction(f0);
      if (frac) return { kind: "var", name, coef: mulFraction(frac, s), form: "fraction", coefStyle: "fraction" };
    }
    // 3(x + 2), -2(3x - 1)
    const g = unwrapInvisible(f1);
    if (g.t === "group" && g.visible && hasVar(g.x)) {
      const num = asSimpleNumber(f0);
      const frac = num ? null : asSimpleFraction(f0);
      if (num || frac) {
        if (!allowParen) throw new UnsupportedShape("Parentheses inside parentheses aren't supported yet.");
        return {
          kind: "paren",
          m: mulFraction(num ? num.value : frac!, s),
          mStyle: num ? num.style : "fraction",
          inner: classifySide(g.x, false) as (ConstTerm | VarTerm)[],
        };
      }
    }
  }

  // (x + 2) or -(x + 2)
  if (node.t === "group" && node.visible) {
    if (!allowParen) throw new UnsupportedShape("Parentheses inside parentheses aren't supported yet.");
    const inner = classifySide(node.x, false) as (ConstTerm | VarTerm)[];
    if (inner.length === 1 && inner[0].kind === "var") {
      // "(3x)" or "-(x)" - just a wrapped single term; treat as the term itself.
      return classifyTerm(sign, node.x, false);
    }
    return { kind: "paren", m: s, mStyle: "int", inner };
  }

  if (node.t === "div") {
    const den = asSimpleNumber(node.den);
    if (den && den.style === "int" && den.value.num !== 0) {
      let numer = unwrapInvisible(node.num);
      let numSign: 1 | -1 = 1;
      for (;;) {
        if (numer.t === "neg") {
          numSign = (numSign === 1 ? -1 : 1) as 1 | -1;
          numer = unwrapInvisible(numer.x);
        } else if (numer.t === "group" && asVar(numer.x)) {
          numer = unwrapInvisible(numer.x); // "(x)/4"
        } else break;
      }
      // x/4, x/-4, -x/4, \frac{x}{4}
      const name = asVar(numer);
      if (name) {
        const total = sign * numSign;
        return {
          kind: "var",
          name,
          coef: makeFraction(total, den.value.num),
          form: "divide",
          coefStyle: "int",
          divisor: den.value.num,
          negatedNumerator: total === -1,
        };
      }
      // 2x/3, \frac{2x}{3}
      if (numer.t === "mul" && numer.factors.length === 2) {
        const n0 = asSimpleNumber(numer.factors[0]);
        const vname = asVar(numer.factors[1]);
        if (n0 && n0.style === "int" && vname) {
          const coef = makeFraction(sign * numSign * n0.value.num, den.value.num);
          return { kind: "var", name: vname, coef, form: "fraction", coefStyle: "fraction" };
        }
      }
      // (x + 3)/2 and similar
      if (numer.t === "group" || numer.t === "add") {
        throw new UnsupportedShape("Dividing a whole expression (like (x + 3)/2) isn't supported yet.");
      }
    }
  }

  throw new UnsupportedShape(UNSUPPORTED_TERM);
}

function classifySide(node: Node, allowParen: boolean): SurfaceTerm[] {
  node = unwrapInvisible(node);
  if (node.t === "add") return node.terms.map((t) => classifyTerm(t.sign, t.node, allowParen));
  return [classifyTerm(1, node, allowParen)];
}

// ---------- LaTeX for the preview ----------

function toLatex(n: Node): string {
  switch (n.t) {
    case "num":
      return n.raw.startsWith(".") ? `0${n.raw}` : n.raw;
    case "var":
      return n.name === "π" ? "\\pi " : n.name;
    case "neg":
      return `-${toLatex(n.x)}`;
    case "group":
      return n.visible ? `\\left(${toLatex(n.x)}\\right)` : toLatex(n.x);
    case "add":
      return n.terms
        .map((t, i) => {
          const body = toLatex(t.node);
          if (i === 0) return t.sign === -1 ? `-${body}` : body;
          return `${t.sign === -1 ? " - " : " + "}${body}`;
        })
        .join("");
    case "mul":
      return n.factors
        .map((f, i) => {
          const body = toLatex(f);
          if (i === 0) return body;
          const prev = n.factors[i - 1];
          // Two numbers side by side need a visible dot ("3 · 4"); a
          // number next to a variable or parenthesis doesn't ("3x").
          const needsDot = f.t === "num" || f.t === "neg" || (prev.t !== "num" && f.t !== "group" && f.t !== "var");
          return `${needsDot ? " \\cdot " : ""}${body}`;
        })
        .join("");
    case "div":
      return `\\dfrac{${toLatex(n.num)}}{${toLatex(n.den)}}`;
  }
}

const REL_LATEX: Record<Relation, string> = { "=": "=", "<": "<", ">": ">", "<=": "\\leq", ">=": "\\geq" };

// ---------- entry point ----------

function anyStyle(terms: SurfaceTerm[], pred: (style: NumStyle) => boolean): boolean {
  return terms.some((t) => {
    if (t.kind === "const") return pred(t.style);
    if (t.kind === "var") return pred(t.coefStyle) || t.form === "fraction";
    return pred(t.mStyle) || anyStyle(t.inner, pred);
  });
}


// One fraction = one fraction, each part a positive whole number or the
// variable, with the variable used exactly once.
function detectProportion(left: Node, right: Node): { TL: number | null; BL: number | null; TR: number | null; BR: number | null; v: string } | null {
  const part = (n: Node): { num: number | null; v: string | null } | null => {
    n = unwrapInvisible(n);
    if (n.t === "var") return { num: null, v: n.name };
    if (n.t === "num" && n.style === "int" && n.value.den === 1 && n.value.num > 0) return { num: n.value.num, v: null };
    return null;
  };
  const side = (n: Node) => {
    n = unwrapInvisible(n);
    if (n.t !== "div") return null;
    const top = part(n.num);
    const bottom = part(n.den);
    return top && bottom ? { top, bottom } : null;
  };
  const L = side(left);
  const R = side(right);
  if (!L || !R) return null;
  const all = [L.top, L.bottom, R.top, R.bottom];
  const vars = all.filter((p) => p.v !== null);
  if (vars.length !== 1) return null;
  return { TL: L.top.num, BL: L.bottom.num, TR: R.top.num, BR: R.bottom.num, v: vars[0].v as string };
}



function percentSentence(p: PercentProblem): string {
  const t = (f: Fraction | null) => (f ? `${f.num / f.den}` : "");
  switch (p.phrasing) {
    case "whatIs":
      return `What is ${t(p.pct)}% of ${t(p.ofN)}?`;
    case "whatNumberIs":
      return `What number is ${t(p.pct)}% of ${t(p.ofN)}?`;
    case "whatPercent":
      return `What % is ${t(p.isN)} out of ${t(p.ofN)}?`;
    case "isOfWhat":
      return `${t(p.isN)} is ${t(p.pct)}% of what number?`;
  }
}

function percentEquation(p: PercentProblem, v: string): ParsedEquation {
  return {
    left: [],
    right: [],
    relation: "=",
    variables: [v],
    linear: { coefs: {}, constant: fromInt(0) },
    usesDecimal: false,
    usesFraction: false,
    latex: `\\text{${percentSentence(p).replace(/%/g, "\\%")}}`,
    percent: p,
  };
}

// Percent problems, read straight from the text: "15%x = 12" (12 is 15% of
// what number), "x = 20% * 45" (what is 20% of 45), either way around.
function detectPercent(chunk: string): { eq: PercentProblem; v: string } {
  const s = chunk.replace(/\s+/g, "");
  const N = "(\\d+(?:\\.\\d+)?)";
  const num = (raw: string) => parseNumber(raw).value;
  let m = s.match(new RegExp(`^${N}%\\*?([a-zA-Z])=${N}$`));
  if (m) return { eq: { isN: num(m[3]), ofN: null, pct: num(m[1]), phrasing: "isOfWhat" }, v: m[2] };
  m = s.match(new RegExp(`^${N}=${N}%\\*?([a-zA-Z])$`));
  if (m) return { eq: { isN: num(m[1]), ofN: null, pct: num(m[2]), phrasing: "isOfWhat" }, v: m[3] };
  m = s.match(new RegExp(`^([a-zA-Z])=${N}%\\*?${N}$`));
  if (m) return { eq: { isN: null, ofN: num(m[3]), pct: num(m[2]), phrasing: "whatIs" }, v: m[1] };
  m = s.match(new RegExp(`^${N}%\\*?${N}=([a-zA-Z])$`));
  if (m) return { eq: { isN: null, ofN: num(m[2]), pct: num(m[1]), phrasing: "whatIs" }, v: m[3] };
  throw new InputError("Percent problems are supported as short questions like \"What is 25% of 40?\", \"What % is 12 out of 48?\" or \"12 is 15% of what number?\"");
}

// The same problems written as sentences.
function detectPercentSentence(text: string): PercentProblem | null {
  // (normalize() has already turned "% of" into "%*".)
  const s = text.toLowerCase().replace(/\s+/g, "").replace(/[?.]+$/, "").replace(/percent/g, "%").replace(/%\*/g, "%of");
  const N = "(\\d+(?:\\.\\d+)?)";
  const num = (raw: string) => parseNumber(raw).value;
  let m = s.match(new RegExp(`^whatis${N}%of${N}$`));
  if (m) return { isN: null, ofN: num(m[2]), pct: num(m[1]), phrasing: "whatIs" };
  m = s.match(new RegExp(`^whatnumberis${N}%of${N}$`));
  if (m) return { isN: null, ofN: num(m[2]), pct: num(m[1]), phrasing: "whatNumberIs" };
  m = s.match(new RegExp(`^what%is${N}(?:outof|of)${N}$`));
  if (m) return { isN: num(m[1]), ofN: num(m[2]), pct: null, phrasing: "whatPercent" };
  // "15 is what percent of 60?" (the same as "What % is 15 of 60?")
  m = s.match(new RegExp(`^${N}iswhat%of${N}$`));
  if (m) return { isN: num(m[1]), ofN: num(m[2]), pct: null, phrasing: "whatPercent" };
  m = s.match(new RegExp(`^${N}is${N}%of(?:what(?:number)?)$`));
  if (m) return { isN: num(m[1]), ofN: null, pct: num(m[2]), phrasing: "isOfWhat" };
  return null;
}

// Two-or-more-letter runs that are words, not products of letters.
const NOT_PRODUCTS = new Set(["is", "of", "the", "what", "out", "and", "or", "for", "solve", "find", "if", "to"]);

// A formula's sides as terms: each a number times letters ("2l", "bh",
// "1/2 bh", "2πr", "bh/2"). Null when it has something else, like
// parentheses around a sum or a letter in a denominator.
function literalMono(n: Node): Mono | null {
  switch (n.t) {
    case "num":
      return { coef: n.value, letters: [] };
    case "var":
      return { coef: fromInt(1), letters: [n.name] };
    case "neg": {
      const m = literalMono(n.x);
      return m && { coef: negFraction(m.coef), letters: m.letters };
    }
    case "group":
      return n.x.t === "add" ? null : literalMono(n.x);
    case "mul": {
      let coef = fromInt(1);
      const letters: string[] = [];
      for (const f of n.factors) {
        const m = literalMono(f);
        if (!m) return null;
        coef = mulFraction(coef, m.coef);
        letters.push(...m.letters);
      }
      return { coef, letters };
    }
    case "div": {
      const num = literalMono(n.num);
      const den = literalMono(n.den);
      if (!num || !den || den.letters.length > 0 || den.coef.num === 0) return null;
      return { coef: divFraction(num.coef, den.coef), letters: num.letters };
    }
    default:
      return null;
  }
}

function literalSide(n: Node): Mono[] | null {
  const u = unwrapInvisible(n);
  const parts = u.t === "add" ? u.terms.map((tm) => ({ sign: tm.sign, node: tm.node })) : [{ sign: 1 as const, node: u }];
  const out: Mono[] = [];
  for (const p of parts) {
    const m = literalMono(p.node);
    if (!m || m.coef.num === 0) return null;
    out.push(p.sign === -1 ? { coef: negFraction(m.coef), letters: m.letters } : m);
  }
  return out;
}

function literalSides(left: Node, right: Node): { left: Mono[]; right: Mono[] } | null {
  const l = literalSide(left);
  const r = literalSide(right);
  return l && r ? { left: l, right: r } : null;
}

// |x - 3| = 5,  2|x - 3| + 1 = 9,  |2x + 1| = 7,  -|x| = -4
const ABS_HELP = "Absolute value problems are supported in shapes like |x - 3| = 5, |x - 3| < 5 or 2|x + 1| - 4 >= 6 (the absolute value on the left, a number on the right).";
function detectAbs(chunk: string): ParsedEquation {
  const s = chunk.replace(/\s+/g, "");
  const m = s.match(/^([+-]?\d*)\|([^|]+)\|(?:([+-])(\d+))?(<=|>=|<|>|=)(-?\d+)$/);
  if (!m) {
    if (/^-?\d+(<=|>=|<|>|=)/.test(s)) throw new InputError("Write it with the absolute value on the left, like |x - 3| = 5 or |x - 3| < 5.");
    throw new InputError(ABS_HELP);
  }
  const coef = (c: string) => (c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c));
  const inner = m[2].match(/^([+-]?\d*)([a-zA-Z])(?:([+-])(\d+))?$/);
  if (!inner) throw new InputError("Inside the absolute value bars, write the variable term first, like |2x - 5| (whole numbers only).");
  const abs: AbsProblem = {
    a: coef(m[1]),
    b: m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0,
    m: coef(inner[1]),
    n: inner[3] ? (inner[3] === "-" ? -1 : 1) * Number(inner[4]) : 0,
    c: Number(m[6]),
  };
  if (abs.a === 0 || abs.m === 0) throw new InputError(ABS_HELP);
  const rel = m[5] as Relation;
  const SYM = { "<": "<", ">": ">", "<=": "\\leq", ">=": "\\geq" } as const;
  return {
    left: [],
    right: [],
    relation: rel,
    variables: [inner[2]],
    linear: { coefs: {}, constant: fromInt(0) },
    usesDecimal: false,
    usesFraction: false,
    latex: chunk.replace(/\|([^|]+)\|/, "\\left|$1\\right|").replace(/<=/g, "\\leq ").replace(/>=/g, "\\geq "),
    ...(rel === "=" ? { abs } : { absIneq: { ...abs, sym: SYM[rel as keyof typeof SYM] } }),
  };
}

// x² + 4x - 12 = 0 (leading coefficient 1, everything on one side)
const FACTOR_HELP = "Quadratics by factoring are supported in the shape x² + bx + c = 0, like x² + 4x - 12 = 0 (whole numbers, everything on the left, 0 on the right).";
function isQuadraticTrinomial(chunk: string): boolean {
  const s = chunk.replace(/\s+/g, "").replace(/\^\{(\d+)\}/g, "^$1");
  const m = s.match(/([a-zA-Z])\^2/);
  if (!m) return false;
  // another x that isn't squared: x² + 4x ...
  return new RegExp(`${m[1]}(?!\\^)`).test(s.replace(`${m[1]}^2`, ""));
}
function detectQuadratic(chunk: string): ParsedEquation {
  const s = chunk.replace(/\s+/g, "").replace(/\^\{(\d+)\}/g, "^$1");
  if (/[<>]/.test(s)) throw new InputError("Quadratic inequalities aren't supported yet.");
  const m = s.match(/^([+-]?\d*)([a-zA-Z])\^2([+-]\d*)\2([+-]\d+)?=(-?\d+)$/);
  if (!m) throw new InputError(FACTOR_HELP);
  if (m[1] !== "" && m[1] !== "+" && m[1] !== "1") throw new InputError("Quadratics with a number in front of x² (like 2x² + 7x + 3 = 0) are their own skill - coming next. For now, try one that starts with x², like x² + 5x + 6 = 0.");
  if (m[5] !== "0") throw new InputError("First move everything to one side so the other side is 0 - for example, x² + 5x = -6 becomes x² + 5x + 6 = 0.");
  const coef = (t: string) => (t === "+" ? 1 : t === "-" ? -1 : Number(t));
  const b = coef(m[3]);
  const c = m[4] ? Number(m[4]) : 0;
  if (c === 0) throw new InputError("With no number on its own (like x² + 4x = 0), it factors as x(x + 4) - that kind isn't supported yet.");
  return {
    left: [],
    right: [],
    relation: "=",
    variables: [m[2]],
    linear: { coefs: {}, constant: fromInt(0) },
    usesDecimal: false,
    usesFraction: false,
    latex: chunk,
    factor: { b, c },
  };
}

// (x - 3)² = 16,  2(x + 1)² - 3 = 47,  (2x + 1)^{2} = 49
const SQ_HELP = "Quadratics by square roots are supported in shapes like (x - 3)² = 16 or 2(x + 1)² - 3 = 47 (the square on the left, a number on the right).";
function detectSquareRoot(chunk: string): ParsedEquation {
  const s = chunk.replace(/\s+/g, "").replace(/\^\{(\d+)\}/g, "^$1").replace(/\\cdot|\*/g, "");
  if (/[<>]/.test(s)) throw new InputError("Inequalities with a square aren't supported yet.");
  const m = s.match(/^([+-]?\d*)\(([^()]+)\)\^(\d+)(?:([+-])(\d+))?=(-?\d+)$/);
  if (!m) {
    if (/^-?\d+=/.test(s)) throw new InputError("Write it with the square on the left, like (x - 3)² = 16.");
    throw new InputError(SQ_HELP);
  }
  if (m[3] !== "2") throw new InputError("Only squares like (x - 3)² are supported here.");
  const coef = (c: string) => (c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c));
  const inner = m[2].match(/^([+-]?\d*)([a-zA-Z])(?:([+-])(\d+))?$/);
  if (!inner) throw new InputError("Inside the parentheses, write the variable term first, like (2x - 5)² (whole numbers only).");
  const sq: SqProblem = {
    a: coef(m[1]),
    b: m[4] ? (m[4] === "-" ? -1 : 1) * Number(m[5]) : 0,
    m: coef(inner[1]),
    n: inner[3] ? (inner[3] === "-" ? -1 : 1) * Number(inner[4]) : 0,
    c: Number(m[6]),
  };
  if (sq.a === 0 || sq.m === 0) throw new InputError(SQ_HELP);
  return {
    left: [],
    right: [],
    relation: "=",
    variables: [inner[2]],
    linear: { coefs: {}, constant: fromInt(0) },
    usesDecimal: false,
    usesFraction: false,
    latex: `${m[1]}\\left(${m[2]}\\right)^2${m[4] ? m[4] + m[5] : ""}=${m[6]}`,
    sqRoot: sq,
  };
}

// x² = 49, 2x^{2} + 3 = 53, 3 + x^2 = 12, 54 = 2x^3, x^2 = 9/16.
const POWER_HELP = "Equations with exponents are supported in shapes like x² = 49, x³ = -8, or 2x² + 3 = 53 (one x² or x³ term, plus numbers).";
function detectPower(chunk: string): ParsedEquation {
  const s = chunk.replace(/\s+/g, "").replace(/\^\{(\d+)\}/g, "^$1");
  if (/[<>]/.test(s)) throw new InputError("Inequalities with x² or x³ aren't supported yet.");
  const pw = s.match(/\^(\d+)/);
  if (pw && pw[1] !== "2" && pw[1] !== "3") throw new InputError("Only squares (x²) and cubes (x³) are supported right now.");
  const sides = s.split("=");
  if (sides.length !== 2) throw new InputError(POWER_HELP);
  const VAL = /^(-?\d+|-?\\frac\{\d+\}\{\d+\})$/;
  const val = (t: string): Fraction => {
    const f = t.match(/^(-?)\\frac\{(\d+)\}\{(\d+)\}$/);
    return f ? makeFraction((f[1] ? -1 : 1) * Number(f[2]), Number(f[3])) : fromInt(Number(t));
  };
  const coef = (c: string) => (c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c));
  const expr = (t: string) => {
    let m = t.match(/^([+-]?\d*)([a-zA-Z])\^([23])(?:([+-])(\d+))?$/);
    if (m) return { a: coef(m[1]), v: m[2], n: Number(m[3]) as 2 | 3, b: m[4] ? (m[4] === "-" ? -1 : 1) * Number(m[5]) : 0, constantFirst: false };
    m = t.match(/^(-?\d+)([+-])(\d*)([a-zA-Z])\^([23])$/);
    if (m) return { a: (m[2] === "-" ? -1 : 1) * coef(m[3]), v: m[4], n: Number(m[5]) as 2 | 3, b: Number(m[1]), constantFirst: true };
    return null;
  };
  let e = expr(sides[0]);
  let orientation: "expressionLeft" | "expressionRight" = "expressionLeft";
  let other = sides[1];
  if (!e) {
    e = expr(sides[1]);
    orientation = "expressionRight";
    other = sides[0];
  }
  if (!e || !VAL.test(other) || e.a === 0) throw new InputError(POWER_HELP);
  const rhs = val(other);
  const power: PowerProblem = { n: e.n, a: e.a, b: e.b, rhs, orientation, constantFirst: e.constantFirst };
  return {
    left: [],
    right: [],
    relation: "=",
    variables: [e.v],
    linear: { coefs: {}, constant: fromInt(0) },
    usesDecimal: false,
    usesFraction: rhs.den !== 1,
    latex: chunk,
    power,
  };
}

export function parseInput(raw: string): ParseResult {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: "Type an equation or inequality to get started." };
    const normalized = normalize(trimmed);

    // A percent question written as a sentence ("What is 25% of 40?").
    const sentence = detectPercentSentence(normalized);
    if (sentence) return { ok: true, equations: [percentEquation(sentence, "x")] };

    // "Solve P = 2l + 2w for w": the letter to solve for.
    let target: string | undefined;
    let text = normalized.replace(/^\s*solve\b\s*/i, "");
    const forMatch = text.match(/\s*\bfor\s*([a-zA-Z])\s*[.?]?\s*$/i);
    if (forMatch) {
      target = forMatch[1];
      text = text.slice(0, forMatch.index);
    }
    const normalizedMath = text;

    // Runs of letters are products in formulas ("rt", "lwh"), but a real
    // word ("solve", "what") gets a clear message instead of a parse error.
    const lettersOnly = normalizedMath.replace(/\\[a-zA-Z]+/g, " ");
    const word = (lettersOnly.match(/[a-zA-Z]{2,}/g) ?? []).find((w) => w.length >= 5 || NOT_PRODUCTS.has(w.toLowerCase()));
    if (word) {
      throw new InputError(
        `I'm not sure what "${word}" means here. Type just the math, like 3x + 5 = 11 (variables are single letters).`
      );
    }

    let join: "and" | "or" | undefined;
    let chunks: string[];
    if (normalizedMath.includes(OR_SEPARATOR)) {
      if (normalizedMath.includes(SEPARATOR)) throw new InputError("Use either \"and\" or \"or\" between the two inequalities, not both.");
      chunks = normalizedMath.split(OR_SEPARATOR).map((c) => c.trim()).filter(Boolean);
      if (chunks.length !== 2) throw new InputError("Type two inequalities with \"or\" between them, like x + 2 < 1 or 3x > 12.");
      join = "or";
    } else {
      chunks = normalizedMath.split(SEPARATOR).map((c) => c.trim()).filter(Boolean);
    }
    if (chunks.length === 0) return { ok: false, error: "Type an equation or inequality to get started." };
    if (chunks.length > 2) throw new InputError("I can handle one equation, or a system of two equations - not more yet.");

    const equations: ParsedEquation[] = chunks.map((chunk) => {
      if (chunk.includes("%")) {
        if (chunks.length > 1) throw new InputError("Percents aren't supported in systems of equations.");
        const { eq, v } = detectPercent(chunk);
        return percentEquation(eq, v);
      }
      if (chunk.includes("|")) {
        if (chunks.length > 1) throw new InputError("Absolute values aren't supported in systems of equations.");
        return detectAbs(chunk);
      }
      if (chunk.includes("^") && isQuadraticTrinomial(chunk)) {
        if (chunks.length > 1) throw new InputError("Exponents aren't supported in systems of equations.");
        return detectQuadratic(chunk);
      }
      if (chunk.includes("^") && /\)\s*\^/.test(chunk)) {
        if (chunks.length > 1) throw new InputError("Exponents aren't supported in systems of equations.");
        return detectSquareRoot(chunk);
      }
      if (chunk.includes("^")) {
        if (chunks.length > 1) throw new InputError("Exponents aren't supported in systems of equations.");
        return detectPower(chunk);
      }
      const tokens = tokenize(chunk);
      const parser = new Parser(tokens);
      const { left, relation, right, relation2, right2 } = parser.parseRelation();

      if (relation2 && right2) {
        if (chunks.length > 1) throw new InputError("Type one compound inequality at a time.");
        if (relation === "=" || relation2 === "=") throw new InputError("A compound inequality uses two inequality signs, like -3 < 2x + 1 < 7.");
        const lo = asSimpleNumber(unwrapInvisible(left)) ?? (asSimpleFraction(left) ? { value: asSimpleFraction(left)!, style: "int" as const } : null);
        const hi = asSimpleNumber(unwrapInvisible(right2)) ?? (asSimpleFraction(right2) ? { value: asSimpleFraction(right2)!, style: "int" as const } : null);
        if (!lo || !hi || !hasVar(right)) {
          throw new InputError("Write a compound inequality with the variable in the middle and a number on each end, like -3 < 2x + 1 <= 7.");
        }
        const m = linearize(right);
        const variables = Object.keys(m.coefs).sort();
        const terms = classifySide(right, true);
        return {
          left: terms,
          right: [],
          relation,
          variables,
          linear: { coefs: m.coefs, constant: m.c },
          usesDecimal: anyStyle(terms, (st) => st === "decimal"),
          usesFraction: anyStyle(terms, (st) => st === "fraction"),
          latex: `${toLatex(left)} ${REL_LATEX[relation]} ${toLatex(right)} ${REL_LATEX[relation2]} ${toLatex(right2)}`,
          sandwich: { left: lo.value, right: hi.value, relation2 },
        };
      }

      const prop = chunks.length === 1 && relation === "=" ? detectProportion(left, right) : null;
      if (prop) {
        const { v, ...nums } = prop;
        return {
          left: [],
          right: [],
          relation,
          variables: [v],
          linear: { coefs: {}, constant: fromInt(0) },
          usesDecimal: false,
          usesFraction: true,
          latex: `${toLatex(left)} ${REL_LATEX[relation]} ${toLatex(right)}`,
          proportion: nums,
        };
      }

      // A formula: more than one letter (or π) in a single equation.
      const letters = new Set(tokens.filter((tk) => tk.t === "var").map((tk) => (tk as { name: string }).name));
      if (chunks.length === 1 && relation === "=" && (letters.size >= 2 || letters.has("π"))) {
        const lit = literalSides(left, right);
        if (lit) {
          return {
            left: [],
            right: [],
            relation,
            variables: Array.from(letters).filter((v) => v !== "π").sort(),
            linear: { coefs: {}, constant: fromInt(0) },
            usesDecimal: false,
            usesFraction: false,
            latex: `${toLatex(left)} = ${toLatex(right)}`,
            literal: lit,
          };
        }
      }
      if (letters.has("π")) {
        throw new InputError("Problems with π are supported in formulas (like C = 2πr), but not here yet.");
      }

      const l = linearize(left);
      const r = linearize(right);
      const diff = linAdd(l, r, -1);
      const variables = Array.from(
        new Set([...Object.keys(l.coefs), ...Object.keys(r.coefs)])
      ).sort();
      if (variables.length === 0) throw new InputError("There's no variable to solve for.");

      const leftTerms = classifySide(left, true);
      const rightTerms = classifySide(right, true);
      const all = [...leftTerms, ...rightTerms];
      return {
        left: leftTerms,
        right: rightTerms,
        relation,
        variables,
        linear: { coefs: diff.coefs, constant: diff.c },
        usesDecimal: anyStyle(all, (st) => st === "decimal"),
        usesFraction: anyStyle(all, (st) => st === "fraction"),
        latex: `${toLatex(left)} ${REL_LATEX[relation]} ${toLatex(right)}`,
      };
    });

    if (!join && equations.length === 2 && equations.every((e) => e.relation !== "=" && !e.sandwich)) join = "and";
    if (join && equations.some((e) => e.relation === "=" || e.sandwich)) {
      throw new InputError("A compound inequality needs an inequality sign (<, >, ≤, ≥) on both sides of the \"and\" / \"or\".");
    }
    if (target && !equations[0]?.literal) {
      throw new InputError(`"Solve for ${target}" works with formulas that have more than one letter, like P = 2l + 2w. For this problem, just type the equation.`);
    }
    return { ok: true, equations, ...(join ? { join } : {}), ...(target ? { target } : {}) };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    throw e;
  }
}
