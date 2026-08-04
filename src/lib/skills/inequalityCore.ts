// Shared helpers specific to inequality skills. Kept separate from
// isolateVariableCore.ts deliberately - that file has no inequality-specific
// knowledge in it, and every existing equation skill continues to import
// from it unchanged. Inequality skills import from both.

export type ComparisonSymbol = "<" | ">" | "\\leq" | "\\geq";

const ALL_SYMBOLS: ComparisonSymbol[] = ["<", ">", "\\leq", "\\geq"];

export function randomSymbol(randIntFn: (min: number, max: number) => number): ComparisonSymbol {
  return ALL_SYMBOLS[randIntFn(0, 3)];
}

export function isInclusive(sym: ComparisonSymbol): boolean {
  return sym === "\\leq" || sym === "\\geq";
}

// Reversing which side of the inequality a value sits on requires exactly
// the same transformation as flipping the symbol when multiplying/dividing
// by a negative - both are "swap which quantity is asserted to be larger."
// One function correctly serves both the mid-solve sign-flip gate and the
// end-of-solve side-swap canonicalization step.
export function flipSymbol(sym: ComparisonSymbol): ComparisonSymbol {
  switch (sym) {
    case "<":
      return ">";
    case ">":
      return "<";
    case "\\leq":
      return "\\geq";
    case "\\geq":
      return "\\leq";
  }
}

export function symbolDirection(sym: ComparisonSymbol): "left" | "right" {
  return sym === "<" || sym === "\\leq" ? "left" : "right";
}

// Inverse of symbolDirection + isInclusive: reconstructs the symbol from a
// (direction, inclusive) pair. Used to build the three graph-MCQ
// distractors (wrong inclusivity, wrong direction, both wrong) by flipping
// one or both properties of the correct answer.
export function symbolFromDirectionInclusive(
  direction: "left" | "right",
  inclusive: boolean
): ComparisonSymbol {
  if (direction === "left") return inclusive ? "\\leq" : "<";
  return inclusive ? "\\geq" : ">";
}

// Unicode rendering for use in plain MCQ choice text (not passed through
// KaTeX), matching how existing skills embed symbols like the division
// sign directly as Unicode in prompt/choice strings.
export function plainSymbol(sym: ComparisonSymbol): string {
  switch (sym) {
    case "<":
      return "<";
    case ">":
      return ">";
    case "\\leq":
      return "\u2264";
    case "\\geq":
      return "\u2265";
  }
}

export function englishRelation(sym: ComparisonSymbol): string {
  switch (sym) {
    case "<":
      return "less than";
    case ">":
      return "greater than";
    case "\\leq":
      return "less than or equal to";
    case "\\geq":
      return "greater than or equal to";
  }
}

const GRAPH_PREFIX = "GRAPH:";

// Encodes a number-line graph as MCQ choice text. StepSolver.tsx detects
// the GRAPH: prefix and renders an SVG number line instead of calling
// MixedText, the same way Cell already branches on PLAINTEXT: and
// STACKEDFRACTION: prefixes for grid-cell content.
//
// `boundary` accepts a plain number (integer skills) or a pre-formatted
// label string (fraction/decimal skills - e.g. "-2/3", or a decimal string
// containing the OVERLINE_START/END markers from fraction.ts for a
// repeating portion). Either way it's just template-literal-stringified
// into the encoding, so callers control the exact label text.
export function graphChoiceText(boundary: number | string, sym: ComparisonSymbol): string {
  const direction = symbolDirection(sym);
  const inclusive = isInclusive(sym) ? 1 : 0;
  return `${GRAPH_PREFIX}${boundary}|${direction}|${inclusive}`;
}

export function isGraphChoice(text: string): boolean {
  return text.startsWith(GRAPH_PREFIX);
}
