// Lets a student choose how numbers that aren't whole are written: as
// fractions (9/2), mixed numbers (4 1/2) or decimals (4.5). Every such
// number the student may switch is tagged so StepSolver can tell when one
// is clicked (it then offers the choice in a pop-up), and once the student
// has picked a form, the numbers are rewritten that way wherever they can
// be: every number in the work, the questions, the answer choices and the
// messages of a problem worked with a calculator
// (SolverInstance.switchableNumbers), and just the final answer in any
// other problem.
import type { GridRow, PairedGridRow, RowUpdate, SolverInstance } from "@/lib/skills/types";

export type NumberForm = "improper" | "mixed" | "decimal";

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// n/d as a decimal: the digits after the point that don't repeat, then the
// ones that do ("1/6" -> 0.1 then 6 repeating). null when the repeating part
// is too long to be worth writing (1/17).
const MAX_REPEAT = 6;
function decimalOf(n: number, d: number): { whole: number; fixed: string; repeat: string } | null {
  const whole = Math.floor(n / d);
  let r = n % d;
  const seen = new Map<number, number>();
  let digits = "";
  while (r !== 0 && !seen.has(r)) {
    if (digits.length > 12) return null;
    seen.set(r, digits.length);
    r *= 10;
    digits += Math.floor(r / d);
    r %= d;
  }
  if (r === 0) return { whole, fixed: digits, repeat: "" };
  const start = seen.get(r)!;
  const repeat = digits.slice(start);
  return repeat.length > MAX_REPEAT ? null : { whole, fixed: digits.slice(0, start), repeat };
}

// The ways n/d (in lowest terms, not whole) can be written.
function formsFor(n: number, d: number): NumberForm[] {
  const out: NumberForm[] = ["improper"];
  if (n > d) out.push("mixed");
  if (decimalOf(n, d)) out.push("decimal");
  return out;
}

function texFor(n: number, d: number, form: NumberForm): string {
  if (form === "decimal") {
    const dec = decimalOf(n, d)!;
    // (a bar over the digits that repeat: 1.666... is written 1.6 with a bar)
    return `${dec.whole}.${dec.fixed}${dec.repeat ? `\\overline{${dec.repeat}}` : ""}`;
  }
  if (form === "mixed") return `${Math.floor(n / d)}\\dfrac{${n % d}}{${d}}`;
  return `\\dfrac{${n}}{${d}}`;
}

// A number's tag: "5-3" for 5/3, "n5-3" for -5/3.
const tagOf = (negative: boolean, n: number, d: number) => `${negative ? "n" : ""}${n}-${d}`;

// The ways one number (by its tag) can be written, each with its math -
// what the pop-up offers. A negative number keeps its sign in every one.
export function formsOfNumber(tag: string): { form: NumberForm; label: string; tex: string }[] {
  const negative = tag.startsWith("n");
  const [n, d] = tag.replace(/^n/, "").split("-").map(Number);
  if (!n || !d) return [];
  // (a decimal that goes on forever is named as one: the bar over its
  // digits marks the part that repeats)
  const repeats = !!decimalOf(n, d)?.repeat;
  const label: Record<NumberForm, string> = { improper: "Fraction", mixed: "Mixed number", decimal: repeats ? "Repeating decimal" : "Decimal" };
  return formsFor(n, d).map((form) => ({ form, label: label[form], tex: `${negative ? "-" : ""}${texFor(n, d, form)}` }));
}

// A fraction of two whole numbers, with a whole number right in front of it
// when it's a mixed number, and its minus sign when it's negative:
// "\dfrac{9}{2}", "4\dfrac{1}{2}", "-\dfrac{5}{3}". (A minus sign with a
// space after it is a subtraction, not part of the number.)
const NUMBER = /(-)?(\d+)?\\dfrac\{(\d+)\}\{(\d+)\}/g;

// The first number in a piece of math that can be written more than one
// way, as its tag - null when there isn't one.
export function firstSwitchableNumber(tex: string): string | null {
  let found: string | null = null;
  switchNumbers(tex, null, false, (tag) => {
    found ??= tag;
  });
  return found;
}

// Rewrites each number in a piece of math in the form the student prefers
// (null: left as written). A number that can't be written that way - 1/2 as
// a mixed number - is left as written too. With `tag`, every number that can
// be switched is also wrapped so a click on it can be recognised (data-nf =
// its tag).
export function switchNumbers(tex: string, preferred: NumberForm | null, tag: boolean, seen?: (tag: string) => void): string {
  return tex.replace(NUMBER, (match, minus: string | undefined, whole: string | undefined, a: string, b: string) => {
    const den = Number(b);
    if (!den) return match;
    const top = (whole ? Number(whole) : 0) * den + Number(a);
    const g = gcd(top, den);
    const n = top / g;
    const d = den / g;
    if (d === 1) return match; // a whole number written as a fraction
    const written: NumberForm = whole ? "mixed" : "improper";
    const forms = formsFor(n, d);
    const form = preferred && forms.includes(preferred) ? preferred : written;
    // (left exactly as it was written unless the student changed it)
    const body = form === written ? match.slice(minus ? 1 : 0) : texFor(n, d, form);
    const key = tagOf(!!minus, n, d);
    if (forms.length > 1) seen?.(key);
    // (the minus sign stays outside the tag, where it was)
    return `${minus ?? ""}${tag && forms.length > 1 ? `\\htmlData{nf=${key}}{${body}}` : body}`;
  });
}

// A line where both sides are being divided in place ("5x/5 = 16/5"): its
// fractions are the division itself, not numbers, so they're left alone.
const DIVISION_TOP = /^\\dfrac\{-?\d+[a-zA-Z]\}\{-?\d+\}$/;
const isDivisionLine = (cells: readonly string[]) => cells.some((c) => DIVISION_TOP.test(c) || c.startsWith("MARKEDFRACTION:"));

function switchRow<T extends GridRow | PairedGridRow>(row: T, preferred: NumberForm | null): T {
  const cells = (row as GridRow).cells;
  if (!Array.isArray(cells) || isDivisionLine(cells)) return row;
  return { ...row, cells: cells.map((c) => switchNumbers(c, preferred, true)) };
}

// "all": every number in the problem follows the student's choice (problems
// worked with a calculator). "answers": only the final answer does - in any
// other problem, the student can still choose how an answer that isn't a
// whole number is written (x = 5/3, 1 2/3 or a decimal), while the work
// above it stays exactly as it was.
export type NumberScope = "all" | "answers";

export function applyNumberForms(instance: SolverInstance, preferred: NumberForm | null, scope: NumberScope = "all"): SolverInstance {
  if (scope === "answers") {
    const answer = <T extends GridRow | PairedGridRow>(row: T): T => ((row as GridRow).highlight === "success" ? switchRow(row, preferred) : row);
    const answers = (us: RowUpdate[] | undefined) => us?.map((u) => ({ ...u, row: answer(u.row) }));
    return {
      ...instance,
      steps: instance.steps.map((st) => ({
        ...st,
        rowUpdates: answers(st.rowUpdates) ?? [],
        ...(st.rowUpdatesOnShow ? { rowUpdatesOnShow: answers(st.rowUpdatesOnShow) } : {}),
      })),
    };
  }
  const updates = (us: RowUpdate[] | undefined) => us?.map((u) => ({ ...u, row: switchRow(u.row, preferred) }));
  return {
    ...instance,
    initialRow: switchRow(instance.initialRow, preferred),
    steps: instance.steps.map((st) => ({
      ...st,
      rowUpdates: updates(st.rowUpdates) ?? [],
      ...(st.rowUpdatesOnShow ? { rowUpdatesOnShow: updates(st.rowUpdatesOnShow) } : {}),
      prompt: switchNumbers(st.prompt, preferred, false),
      // (the answer choices are written the same way as the work)
      choices: st.choices.map((c) => ({ ...c, text: switchNumbers(c.text, preferred, false) })),
      explanationOnCorrect: switchNumbers(st.explanationOnCorrect, preferred, false),
    })),
  };
}

// The tag of the last number, among lines already on the card, that the
// student can switch - what the "choose the form" button opens. null when
// there is nothing to switch yet.
export function lastSwitchableTag(rows: readonly (GridRow | PairedGridRow)[]): string | null {
  let found: string | null = null;
  for (const row of rows) {
    const cells = (row as GridRow).cells;
    if (!Array.isArray(cells)) continue;
    for (const c of cells) for (const m of c.matchAll(/\\htmlData\{nf=([n\d-]+)\}/g)) found = m[1];
  }
  return found;
}
