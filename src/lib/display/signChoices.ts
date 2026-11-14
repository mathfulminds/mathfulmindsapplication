// When a step's answer is one term that lands AFTER another term in its
// expression or side ("5x + 4" -> the "+4"), a positive answer is shown
// with its plus sign: "+4", "+2x". When it lands first ("4 = ..." or the
// first term of an expression), it's shown plainly. 0 never gets a sign.
// Every choice in the step is written the same way, so the sign never
// gives the answer away.
import type { GridRow, PairedGridRow, SolverInstance, SolverStep } from "@/lib/skills/types";

const TERM = /^([+-]?)((?:\d+(?:\.\d+)?|\\[dt]?frac\{\d+\}\{\d+\})?(?:[a-zA-Z](?:\^\{?\d+\}?)?)*)$/;

// "$+3x$" -> { sign: "+", body: "3x" }; null when it isn't a single term
export function readTerm(text: string): { sign: string; body: string } | null {
  const t = text
    .replace(/^PLAINTEXT:/, "")
    .replace(/[\u0001-\u0004]/g, "")
    .replace(/\$/g, "")
    .replace(/\\hspace\{[^}]*\}|\\[,:; ]|\\!|\\quad/g, "")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
  if (!t) return null;
  const m = t.match(TERM);
  if (!m || !m[2] || !/[0-9a-zA-Z]/.test(m[2])) return null;
  return { sign: m[1], body: m[2] };
}

function cellTerm(cell: string | undefined): { sign: string; body: string } | null {
  if (!cell) return null;
  if (/^[A-Z]+:/.test(cell.replace(/^(LEFTALIGN:|MARKEDTERM:)+/, ""))) return null;
  return readTerm(cell.replace(/^(LEFTALIGN:|MARKEDTERM:)+/, "").replace(/\\phantom\{[^}]*\}/g, ""));
}

const blank = (c: string | undefined) => !c || !c.replace(/^(LEFTALIGN:|MARKEDTERM:)+/, "").replace(/\\phantom\{[^}]*\}/g, "").trim();

// Where the answer lands in the line(s) this step writes: "first" (leads
// its side), "after" (follows another term), or null (not found).
function placeOf(step: SolverStep, eq: number, answer: { sign: string; body: string }): "first" | "after" | null {
  const lines: string[][] = [];
  for (const u of step.rowUpdates) {
    const r = u.row as GridRow & Partial<PairedGridRow>;
    if (Array.isArray(r.cells)) lines.push(r.cells);
    if (Array.isArray(r.eq1)) lines.push(r.eq1);
    if (Array.isArray(r.eq2)) lines.push(r.eq2);
  }
  const want = `${answer.sign === "-" ? "-" : ""}${answer.body}`;
  let found: "first" | "after" | null = null;
  // equation lines (with a sign in the middle) first, then notes under them
  const ordered = [...lines.filter((l) => isSeparator(l[eq] ?? "")), ...lines];
  for (const cells of ordered) {
    for (let c = 0; c < cells.length; c++) {
      if (c === eq) continue;
      const t = cellTerm(cells[c]);
      if (!t || `${t.sign === "-" ? "-" : ""}${t.body}` !== want) continue;
      // first in its expression: nothing before it, or a sign / "or" / "and"
      let k = c - 1;
      while (k >= 0 && blank(cells[k])) k--;
      found = k < 0 || isSeparator(cells[k]) ? "first" : "after";
      return found;
    }
  }
  return found;
}

function isSeparator(cell: string): boolean {
  const t = cell.replace(/^(LEFTALIGN:|MARKEDTERM:|PLAINTEXT:|SPILL:)+/, "").replace(/\\text\{([^}]*)\}/g, "$1").replace(/\\mkern-?[\d.]+mu/g, "").replace(/\\(quad|qquad|,|:|;)/g, "").trim();
  return /^(=|<|>|≤|≥|\\le|\\ge|\\leq|\\geq|\\ne|\\neq|\\lt|\\gt|or|and|,)$/.test(t) || /^\\(text|mathrm)\{\s*(or|and)\s*\}$/.test(t);
}

const isZero = (body: string) => /^0(\.0+)?$/.test(body);

function withSign(text: string): string {
  const t = readTerm(text);
  if (!t || t.sign || isZero(t.body)) return text;
  // keep the choice's own math markup: put the "+" just inside it
  if (text.startsWith("$")) return `$+${text.slice(1)}`;
  return `+${text}`;
}

// When like terms combine to a lone variable (x, -x, y²...), the message
// reminds the student what that means: "The terms combine to x. Remember,
// x means 1x." Whatever the message said after that about the rest of the
// line ("brought down unchanged", "simplifies to ...") stays.
function loneVariableMessage(st: SolverStep): SolverStep {
  if (!/combine/i.test(st.stepId)) return st;
  const right = st.choices.find((c) => c.isCorrect);
  const t = right && readTerm(right.text);
  if (!t || !/^[a-zA-Z](\^\{?\d+\}?)?$/.test(t.body)) return st;
  const neg = t.sign === "-";
  const v = t.body;
  const keep = (st.explanationOnCorrect ?? "")
    .split(/(?<=\.)\s+(?=[A-Z$])/)
    .slice(1)
    .filter((sn) => /brought down|simplifies to|final answer/i.test(sn));
  const msg = `The terms combine to $${neg ? "-" : ""}${v}$. Remember, $${neg ? "-" : ""}${v}$ means $${neg ? "-" : ""}1${v}$.`;
  return { ...st, explanationOnCorrect: [msg, ...keep].join(" ") };
}

// Undoing the number in front: the question reads "What undoes
// multiplying 5 by x?" (the number first), and the message reads "Undo
// multiplication of 5 by dividing 5 on both sides of the equation."
function undoWording(st: SolverStep, rel: string): SolverStep {
  let prompt = st.prompt;
  let coef: string | null = null;
  prompt = prompt.replace(/What undoes multiplying (.+?) by (.+?)\?/, (_m, what: string, by: string) => {
    coef = by;
    return `What undoes multiplying ${by} by ${what}?`;
  });
  prompt = prompt.replace(/What (?:operation )?isolates (\S+) when its coefficient is (.+?)\?/, (_m, what: string, by: string) => {
    coef = by;
    return `What undoes multiplying ${by} by ${what}?`;
  });
  const isUndo = coef !== null || /undoes dividing/.test(st.prompt) || /eliminate_coefficient|reciprocal/.test(st.stepId);
  if (!isUndo) return st;
  const end = (n: number) => `(?=\\s|$)`;
  let ex = st.explanationOnCorrect ?? "";
  const swap = (re: RegExp, f: (...a: string[]) => string) => {
    ex = ex.replace(re, (...a: string[]) => f(...a));
  };
  swap(new RegExp(`^(?:The (?:coefficient )?)?(.+?) cancels when (?:you|we) divide both sides by (.+?)\\.${end(0)}`), (_m, _a, b) => `Undo multiplication of ${b} by dividing ${b} on both sides of the ${rel}.`);
  swap(new RegExp(`^Undo multiplication by dividing both sides by (.+?)\\.${end(0)}`), (_m, b) => `Undo multiplication of ${b} by dividing ${b} on both sides of the ${rel}.`);
  swap(new RegExp(`^Undo division by multiplying both sides by (.+?)\\.${end(0)}`), (_m, b) => `Undo division of ${b} by multiplying ${b} on both sides of the ${rel}.`);
  swap(/^Multiply(?:ing)? both sides by the reciprocal, (.+?), since a fraction times its reciprocal equals 1\./, (_m, r) => `Undo multiplication of ${coef ?? "the fraction"} by multiplying ${r} on both sides of the ${rel}.`);
  return { ...st, prompt, explanationOnCorrect: ex };
}

export function signChoices(inst: SolverInstance): SolverInstance {
  const relCells = JSON.stringify(inst.initialRow ?? "");
  const rel = /[<>≤≥]|\\le|\\ge|\\lt|\\gt/.test(relCells) ? "inequality" : "equation";
  const steps = inst.steps.map(loneVariableMessage).map((st) => undoWording(st, rel)).map((st) => {
    const right = st.choices.find((c) => c.isCorrect);
    const ans = right && readTerm(right.text);
    if (!ans) return st;
    const place = placeOf(st, inst.eqColumnIndex, ans);
    if (!place) return st;
    // only steps whose choices are all single terms
    if (!st.choices.every((c) => readTerm(c.text))) return st;
    // (a term that leads keeps its choices exactly as the skill wrote them)
    if (place !== "after") return st;
    const fix = withSign;
    const choices = st.choices.map((c) => ({ ...c, text: fix(c.text) }));
    // two choices that only differed by a written "+" would now match
    if (new Set(choices.map((c) => c.text)).size !== choices.length) return st;
    return { ...st, choices };
  });
  return { ...inst, steps };
}
