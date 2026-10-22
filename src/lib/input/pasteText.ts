// Pasted text ("2x < 8 and 3x + 1 > 7", "What is 20 percent of 50?"):
// the editor would read it all as math and drop the spaces, so words are
// turned into word text first - the same as when they're typed. A word is a
// run of letters that's a real word (4+ letters, or a short one like "and",
// "or", "is"); single letters and products like "lw" stay math. Returns null
// for plain math (or LaTeX), which the editor pastes as usual.
const SHORT_WORDS = new Set(["is", "of", "or", "and", "for", "the", "out", "are", "by", "to", "if", "in", "an", "its", "was", "has"]);
export function pastedToLatex(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.includes("\\")) return null;
  const isWord = (w: string) => w.length >= 4 || SHORT_WORDS.has(w.toLowerCase());
  const pieces = t.split(/([A-Za-z]+)/);
  if (!pieces.some((p, i) => i % 2 === 1 && isWord(p))) return null;
  const mathOf = (m: string) =>
    m
      .replace(/\s+/g, "")
      .replace(/≤|<=/g, "\\le ")
      .replace(/≥|>=/g, "\\ge ")
      .replace(/≠/g, "\\ne ")
      .replace(/[−–]/g, "-")
      .replace(/×/g, "\\times ")
      .replace(/÷/g, "\\div ")
      .replace(/%/g, "\\%");
  let out = "";
  let text_ = ""; // word text being collected
  let math = "";
  const flushMath = () => {
    if (math.trim()) out += mathOf(math);
    else if (math && text_ === "" && out.endsWith("}")) text_ = " "; // keep a space between two word runs
    math = "";
  };
  const flushText = () => {
    if (text_) out += `\\text{${text_}}`;
    text_ = "";
  };
  pieces.forEach((p, i) => {
    if (i % 2 === 1 && isWord(p)) {
      // the spaces around a word belong to the word text
      const lead = math.match(/\s*$/)?.[0] ?? "";
      math = math.slice(0, math.length - lead.length);
      if (math) {
        flushText();
        flushMath();
      }
      text_ += (lead ? " " : "") + p;
      return;
    }
    if (text_ && /^\s+/.test(p)) {
      // a space right after a word: keep it with the word if another word follows
      const sp = p.match(/^\s+/)![0];
      const rest = p.slice(sp.length);
      const nextIsWord = rest === "" && i + 1 < pieces.length && isWord(pieces[i + 1]);
      if (nextIsWord) {
        text_ += " ";
        return;
      }
      text_ += " ";
      flushText();
      math += rest;
      return;
    }
    if (text_ && p !== "") flushText();
    math += p;
  });
  flushText();
  flushMath();
  return out;
}
