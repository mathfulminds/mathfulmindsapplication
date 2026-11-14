// Turns the math inside a plain-text choice ("Subtracting 7x from both
// sides", "x = 2 or x = -3", "-4") into $...$ spans, so it renders in the
// math font (KaTeX) while the words stay in the normal font. Text that
// already carries its own math markup ($...$ or number markers) is left
// alone.

const STOP2 = new Set(["or", "by", "to", "of", "is", "it", "an", "no", "as", "at", "be", "do", "if", "in", "on", "so", "up", "we", "me", "my", "he", "go", "us", "am", "ok"]);

const ATOM = new RegExp(
  [
    String.raw`\(\s*-?\d+(?:\.\d+)?(?:/\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:/\d+)?\s*\)`, // ordered pair
    String.raw`√\(?\d+\)?`,
    String.raw`\d+(?:\.\d+)?(?:/\d+)?(?:[a-zA-Z]{1,2}(?![a-zA-Z]))?(?:\^\{?-?\d+\}?|[²³])?`, // 3, 1/2, 3x, 2xy, 4x^2
    String.raw`[a-zA-Z]{1,2}(?![a-zA-Z'’])(?:\^\{?-?\d+\}?|[²³])?`, // x, xy, x^2 (checked below)
    String.raw`\)[²³]`,
    String.raw`[+\-−×·÷*/=<>≤≥≠()|]`,
  ].join("|"),
  "g"
);

function isVarWord(w: string): boolean {
  const letters = w.replace(/\^.*$/, "");
  if (letters.length === 2) return !STOP2.has(letters.toLowerCase());
  return true;
}

function toTex(run: string): string {
  return run
    .replace(/−/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\s+/g, " ")
    .replace(/(\d+(?:\.\d+)?)\/(\d+)/g, "\\frac{$1}{$2}")
    .replace(/√\(?(\d+)\)?/g, "\\sqrt{$1}")
    .replace(/×/g, "\\times ")
    .replace(/·|\*/g, "\\cdot ")
    .replace(/÷/g, "\\div ")
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/≠/g, "\\ne ")
    .replace(/\|/g, "\\vert ");
}

export function autoMath(text: string): string {
  if (!text || text.includes("$") || /[\u0001-\u0004]/.test(text) || /^[A-Z]+:/.test(text)) return text;
  // Tokens with their positions; a math run is consecutive math tokens
  // separated only by spaces.
  type Tok = { s: number; e: number; t: string; kind: "num" | "var" | "op" };
  const toks: Tok[] = [];
  for (const m of text.matchAll(ATOM)) {
    const t = m[0];
    const s = m.index!;
    // a letter group must stand alone as a word (not part of "Adding")
    if (/^[a-zA-Z]/.test(t)) {
      const before = text[s - 1] ?? " ";
      if (/[a-zA-Z'’]/.test(before)) continue;
      if (!isVarWord(t)) continue;
      if (/^(a|A|I)$/.test(t.replace(/[\^²³].*$/, "")) && text.trim() !== t) continue; // the word "a"
    }
    if (/^\d/.test(t) && /[a-zA-Z]/.test(text[s - 1] ?? "")) continue;
    toks.push({ s, e: s + t.length, t, kind: /\d|√/.test(t) ? "num" : /^\)/.test(t) ? "op" : /^[a-zA-Z]/.test(t) ? "var" : "op" });
  }
  const runs: Tok[][] = [];
  for (const tk of toks) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && /^\s*$/.test(text.slice(prev.e, tk.s))) last.push(tk);
    else runs.push([tk]);
  }
  let out = "";
  let at = 0;
  for (let run of runs) {
    // a sign or bracket hanging off the end of a run belongs to the words
    // ("x-term"), and a lone dash between words is punctuation
    while (run.length && run[run.length - 1].kind === "op" && !/[)|]/.test(run[run.length - 1].t)) run = run.slice(0, -1);
    while (run.length && run[0].kind === "op" && !/[-−+(|]/.test(run[0].t)) run = run.slice(1);
    if (!run.length) continue;
    const hasNum = run.some((t) => t.kind === "num");
    const vars = run.filter((t) => t.kind === "var");
    // a lone letter is math only if it's not the word "a" / "I"
    const lone = run.length === 1 && run[0].kind === "var";
    if (!hasNum && !vars.length) continue;
    if (lone && /^(a|A|I)$/.test(run[0].t)) continue;
    if (!hasNum && run.every((t) => t.kind === "var") && run.length > 1) continue; // two words in a row
    const s = run[0].s;
    const e = run[run.length - 1].e;
    out += text.slice(at, s) + "$" + toTex(text.slice(s, e)) + "$";
    at = e;
  }
  return out + text.slice(at);
}
