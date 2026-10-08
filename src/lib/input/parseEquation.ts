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
}

export type ParseResult =
  | { ok: true; equations: ParsedEquation[] }
  | { ok: false; error: string };

// ---------- errors ----------

class InputError extends Error {}

// ---------- normalization ----------

const SEPARATOR = "\n";

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

  // Pure-presentation LaTeX that carries no math meaning.
  // An empty box the student hasn't filled in yet (from the math editor).
  if (/\\placeholder/.test(s)) {
    throw new InputError("There's still an empty box in the problem. Fill it in (or delete it), then try again.");
  }
  s = s.replace(/\\mleft|\\mright|\\left|\\right|\\displaystyle|\\big|\\Big|\\bigg|\\Bigg/g, "");
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
  s = s.replace(/\band\b/gi, SEPARATOR);
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
      if (cmd === "pi") throw new InputError("Problems with π aren't supported yet. Right now you can solve linear equations, linear inequalities, and systems of two linear equations.");
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

  parseRelation(): { left: Node; relation: Relation; right: Node } {
    if (this.atEnd()) throw new InputError("Type an equation or inequality to get started.");
    const left = this.parseExpr();
    const relTok = this.next();
    if (!relTok) throw new InputError("I need an equals sign (or <, >, ≤, ≥) to know what to solve.");
    if (relTok.t !== "rel") throw new InputError("Something in the problem doesn't fit together - check for a missing operator or parenthesis.");
    if (this.atEnd()) throw new InputError("There's nothing on the right side of the equals sign.");
    const right = this.parseExpr();
    const after = this.peek();
    if (after && after.t === "rel") throw new InputError("Compound inequalities (like 1 < x < 5) aren't supported yet.");
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
      return n.name;
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

export function parseInput(raw: string): ParseResult {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: "Type an equation or inequality to get started." };
    const normalized = normalize(trimmed);

    // Runs of 2+ letters ("solve", "xy") are almost always words or
    // implied products - give a clear message instead of a parse error.
    const lettersOnly = normalized.replace(/\\[a-zA-Z]+/g, " ");
    const word = lettersOnly.match(/[a-zA-Z]{2,}/);
    if (word) {
      throw new InputError(
        `I'm not sure what "${word[0]}" means here. Type just the math, like 3x + 5 = 11 (variables are single letters).`
      );
    }

    const chunks = normalized.split(SEPARATOR).map((c) => c.trim()).filter(Boolean);
    if (chunks.length === 0) return { ok: false, error: "Type an equation or inequality to get started." };
    if (chunks.length > 2) throw new InputError("I can handle one equation, or a system of two equations - not more yet.");

    const equations: ParsedEquation[] = chunks.map((chunk) => {
      const tokens = tokenize(chunk);
      const parser = new Parser(tokens);
      const { left, relation, right } = parser.parseRelation();

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

    return { ok: true, equations };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    throw e;
  }
}
