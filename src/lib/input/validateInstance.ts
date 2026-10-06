// Safety net for problems a student typed in (or photographed).
//
// Every skill builder was written and stress-tested against the numbers
// its OWN generator picks - a student's problem can fall outside that
// range in ways the builder never had to handle. Rather than trust every
// builder blindly, each routed problem's finished SolverInstance is
// checked here before it's shown. If anything looks broken, the page
// shows a friendly "not supported yet" message instead of a step that
// reads wrong. Also used by the stress tests, so the same rules that
// gate a real student's problem are the ones verified at scale.

import type { SolverInstance, GridRow, PairedGridRow } from "@/lib/skills/types";

export interface ValidationIssue {
  where: string;
  problem: string;
  // Cosmetic issues are real but already present in the skill's own
  // practice page (so they're fixed in the skill, not by refusing typed
  // problems). Only non-cosmetic issues block a typed problem from showing.
  cosmetic?: boolean;
}

export function blockingIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => !i.cosmetic);
}

function isPaired(row: GridRow | PairedGridRow): row is PairedGridRow {
  return (row as PairedGridRow).eq1 !== undefined;
}

function rowCells(row: GridRow | PairedGridRow): string[] {
  if (isPaired(row)) return [...row.eq1, ...row.eq2];
  return [...row.cells, ...(row.caption ? [row.caption] : [])];
}

// Text that only ever appears when a number went wrong somewhere.
const BROKEN_VALUE = /NaN|undefined|Infinity|\bnull\b|\[object|\d(\.\d+)?e[+-]\d/;
// Floating-point noise like 0.30000000000000004.
const FLOAT_NOISE = /\d\.\d*(0000000|9999999)\d*/;
// Two signs in a row: "+ -5", "- -5", "+ +5" (with or without the gap).
const DOUBLE_SIGN = /[+-]\s*(\\hspace\{[^}]*\})?\s*[+-]\s*(\\hspace\{[^}]*\})?\s*\d/;
// A signed zero term sitting in the grid ("+ 0", "- 0").
const SIGNED_ZERO_TERM = /(^|[^0-9.])[+-]\s*(\\hspace\{[^}]*\})?\s*0(?![.0-9])(?!\s*\))/;

const TIE_STEPS = new Set(["choose_variable", "choose_substitute_equation"]);

export function validateInstance(instance: SolverInstance, variables: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // "1x" / "-1x" - a coefficient of 1 should never be written out.
  const ONE_COEF = new RegExp(`(^|[^0-9.{\\\\])1(${variables.join("|")})(?![a-zA-Z])`);
  const ZERO_COEF = new RegExp(`(^|[^0-9.{\\\\])0(${variables.join("|")})(?![a-zA-Z])`);

  function checkText(where: string, text: string, isCell: boolean) {
    if (BROKEN_VALUE.test(text)) issues.push({ where, problem: `broken value in "${text}"` });
    if (FLOAT_NOISE.test(text)) issues.push({ where, problem: `floating-point noise in "${text}"` });
    if (DOUBLE_SIGN.test(text)) issues.push({ where, problem: `double sign in "${text}"` });
    // Prompts and explanations legitimately say things like "-x means
    // -1x" or "3x - 3x = 0x" - only the grid itself must never show them.
    if (isCell && ONE_COEF.test(text)) issues.push({ where, problem: `coefficient of 1 written out in "${text}"` });
    if (isCell && ZERO_COEF.test(text)) issues.push({ where, problem: `zero coefficient in "${text}"` });
    if (isCell && SIGNED_ZERO_TERM.test(text)) issues.push({ where, problem: `signed zero term in "${text}"` });
  }

  // "First term never gets a forced sign": in a real equation row, the
  // first visible term on each side must use its natural sign ("-9",
  // "x"), never a forced one ("- 9", "+ x"). Annotation rows (no relation
  // symbol, like a "-9x" written under both sides) are exempt.
  const RELATIONS = new Set(["=", "<", ">", "\\leq", "\\geq"]);
  const strip = (c: string) => c.replace(/^(MARKEDTERM:|LEFTALIGN:|PLAINTEXT:)+/, "");
  const isBlank = (c: string) => strip(c).trim() === "" || strip(c) === "\\phantom{0}";
  function checkLeadingSigns(where: string, cells: readonly string[]) {
    const eqIdx = cells.findIndex((c) => RELATIONS.has(c));
    if (eqIdx < 0) return;
    for (const side of [cells.slice(0, eqIdx), cells.slice(eqIdx + 1)]) {
      const first = side.find((c) => !isBlank(c));
      if (first === undefined) continue;
      const body = strip(first);
      if (/^\+/.test(body) || /^-\s*\\hspace/.test(body)) {
        issues.push({ where, problem: `first term has a forced sign: "${first}"`, cosmetic: true });
      }
    }
  }
  function checkRow(where: string, row: GridRow | PairedGridRow) {
    if (isPaired(row)) {
      checkLeadingSigns(where, row.eq1);
      checkLeadingSigns(where, row.eq2);
    } else if (!row.caption) checkLeadingSigns(where, row.cells);
  }

  if (!instance || !Array.isArray(instance.steps) || instance.steps.length === 0) {
    return [{ where: "instance", problem: "no steps" }];
  }

  rowCells(instance.initialRow).forEach((c) => checkText("initial row", c, true));
  checkRow("initial row", instance.initialRow);

  instance.steps.forEach((step, si) => {
    const where = `step ${si + 1} (${step.stepId})`;
    if (!step.choices || step.choices.length < 2) issues.push({ where, problem: "fewer than 2 choices" });
    const correct = step.choices.filter((c) => c.isCorrect).length;
    // Exactly one right answer - except the Elimination questions where two
    // options can be genuinely equally good (which variable to eliminate,
    // which equation to substitute into); there both count as correct.
    const tieAllowed = TIE_STEPS.has(step.stepId) && correct === 2;
    if (correct !== 1 && !tieAllowed) issues.push({ where, problem: `${correct} correct choices` });
    const seen = new Set<string>();
    for (const c of step.choices) {
      const key = c.text.replace(/\s+/g, "");
      if (seen.has(key)) issues.push({ where, problem: `duplicate choice "${c.text}"` });
      seen.add(key);
      checkText(where, c.text, false);
    }
    checkText(where, step.prompt, false);
    checkText(where, step.explanationOnCorrect, false);
    for (const u of step.rowUpdates) {
      rowCells(u.row).forEach((c) => checkText(`${where} row ${u.slotId}`, c, true));
      checkRow(`${where} row ${u.slotId}`, u.row);
    }
    if (step.distributeVisual) {
      const dv = step.distributeVisual;
      [dv.coefficient, dv.term1, dv.term2, dv.prefix ?? "", dv.suffix ?? ""].forEach((t) => checkText(`${where} arrows`, t, true));
    }
  });

  // The last highlighted ("success") row is the answer - it has to
  // actually show one (a number, or a verdict caption like "No solution").
  const successRows = instance.steps.flatMap((st) => st.rowUpdates.map((u) => u.row)).filter((r) => {
    const h = isPaired(r) ? r.eq1Highlight ?? r.eq2Highlight : r.highlight;
    return h === "success";
  });
  const finalRow = successRows[successRows.length - 1];
  if (finalRow && !rowCells(finalRow).some((c) => /\d|solution/i.test(c))) {
    issues.push({ where: "final row", problem: "the answer row doesn't show a value" });
  }

  return issues;
}
