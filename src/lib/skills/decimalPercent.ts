// Decimal and percent equations. Three kinds, each laid out and worded
// like the existing skills:
//
//   0.4x + 1.5 = 3.1     two-step with decimals - exactly the Two-Step
//                        Equations steps (undo the constant, see it cancel,
//                        combine, divide in place, coefficient becomes 1,
//                        compute), with exact decimal arithmetic.
//
//   What is 25% of 40?   a short percent question, set up as the
//                        proportion is/of = %/100: the student places 100,
//                        then each number from the question, then a
//                        variable for the unknown - and the proportion is
//                        solved with the Proportions skill's steps (cross
//                        multiplying, with the loops).
//   Kinds: "What is 25% of 40?", "What number is 25% of 40?",
//   "What % is 12 out of 48?" (and, typed in, "12 is 15% of what number?").

import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import type { Fraction } from "./fraction";
import { makeFraction, addFraction, subFraction, mulFraction, divFraction, negFraction, isInteger, fromInt } from "./fraction";
import { BLANK, Orientation, SIGN_GAP, assembleRow, eqColumnIndexFor, randBool, randInt, shuffle } from "./isolateVariableCore";
import { K, Ksigned, P, Pabs, dedup, choicesWith } from "./oneStepRational";
import { buildProportionInstance } from "./proportions";

const D = "decimal" as const;

export interface PercentWordProblem {
  kind: "percentWord";
  // Exactly one of these is null - the unknown.
  isN: Fraction | null;
  ofN: Fraction | null;
  pct: Fraction | null;
  phrasing: "whatIs" | "whatNumberIs" | "whatPercent" | "isOfWhat";
}

export type DecimalPercentProblem =
  | { kind: "twoStep"; a: Fraction; b: Fraction; c: Fraction; variableFirst: boolean; orientation: Orientation }
  | PercentWordProblem;

// ---------- generator ----------

const COEFS = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 1.2, 1.5, 2.5];
const PERCENTS = [5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 80, 120, 150];

const dec = (x: number, places = 2) => makeFraction(Math.round(x * 10 ** places), 10 ** places);

export function generateDecimalPercent(): DecimalPercentProblem {
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const r = Math.random();
  if (r < 0.5) {
    for (;;) {
      const a = dec(COEFS[randInt(0, COEFS.length - 1)]);
      let x = randInt(-10, 10);
      while (x === 0) x = randInt(-10, 10);
      let bTenths = randInt(1, 99);
      while (bTenths % 10 === 0) bTenths = randInt(1, 99);
      const b = makeFraction(bTenths * (randBool() ? 1 : -1), 10);
      const c = addFraction(mulFraction(a, fromInt(x)), b);
      if (c.num === 0) continue;
      return { kind: "twoStep", a, b, c, variableFirst: Math.random() < 0.75, orientation };
    }
  }
  // A percent question - the three kinds, evenly. About a third have an
  // answer that isn't a whole number (written as a fraction, then as a
  // decimal).
  const which = randInt(0, 2);
  const allowDecimal = Math.random() < 0.35;
  const ok = (f: Fraction) => (allowDecimal ? !isInteger(f) && f.den <= 20 && [2, 4, 5, 8, 10, 20].includes(f.den) : isInteger(f)) && f.num > 0;
  for (;;) {
    const pct = PERCENTS[randInt(0, PERCENTS.length - 1)];
    if (which === 0) {
      // What is 25% of 40?
      const of = randInt(2, 60) * (allowDecimal ? 1 : 2);
      const isVal = makeFraction(pct * of, 100);
      if (!ok(isVal)) continue;
      return { kind: "percentWord", isN: null, ofN: fromInt(of), pct: fromInt(pct), phrasing: "whatIs" };
    }
    if (which === 1) {
      // 12 is 15% of what number?
      const isVal = randInt(2, 60);
      const of = makeFraction(isVal * 100, pct);
      if (!ok(of) || of.num / of.den > 1000) continue;
      return { kind: "percentWord", isN: fromInt(isVal), ofN: null, pct: fromInt(pct), phrasing: "isOfWhat" };
    }
    // What % is 12 out of 48?
    const of = [4, 5, 8, 10, 16, 20, 25, 40, 50, 80][randInt(0, 9)] * randInt(1, 3);
    const isVal = randInt(1, of - 1);
    const pctAns = makeFraction(isVal * 100, of);
    if (!ok(pctAns)) continue;
    return { kind: "percentWord", isN: fromInt(isVal), ofN: fromInt(of), pct: null, phrasing: "whatPercent" };
  }
}

// ---------- shared pieces ----------

const plain = (f: Fraction) => P(f, D);
const val = (f: Fraction) => K(f, D);
const varTermNatural = (a: Fraction, v: string) =>
  a.num === a.den ? v : a.num === -a.den ? `-${v}` : `${val(a)}${v}`;
const varTermForced = (a: Fraction, v: string) => {
  const abs = a.num < 0 ? negFraction(a) : a;
  return `${a.num < 0 ? "-" : "+"}${SIGN_GAP}${abs.num === abs.den ? v : `${val(abs)}${v}`}`;
};

// The divide-in-place steps every skill uses: "0.4x = 1.6" becomes
// "0.4x/0.4 = 1.6/0.4", the 0.4s get crossed out, then the value.
function divideSteps(
  a: Fraction,
  rhs: Fraction,
  v: string,
  slot: string,
  rowFor: (varCell: string, rhsCell: string, highlight?: GridRow["highlight"]) => GridRow
): SolverStep[] {
  const solution = divFraction(rhs, a);
  const aK = val(a);
  const aP = plain(a);
  const rhsP = plain(rhs);
  const steps: SolverStep[] = [];
  steps.push({
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: slot, row: rowFor(`\\dfrac{${varTermNatural(a, v)}}{${aK}}`, `\\dfrac{${val(rhs)}}{${aK}}`) }],
    prompt: `What undoes multiplying ${v} by ${aP}?`,
    choices: shuffle<Choice>([
      { text: `Dividing both sides by ${aP}`, isCorrect: true, misconceptionTag: null },
      { text: `Multiplying both sides by ${aP}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: `Subtracting ${aP} from both sides`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
    ]),
    explanationOnCorrect: `Undo multiplication by dividing both sides by ${aP}.`,
  });
  steps.push({
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: slot, row: rowFor(`MARKEDFRACTION:${aK}\u0006${v}\u0005${aK}`, `\\dfrac{${val(rhs)}}{${aK}}`) },
      { slotId: "coefficient_confirmed", row: rowFor(v, BLANK) },
    ],
    prompt: `What is ${aP} ÷ ${aP}?`,
    choices: choicesWith("1", dedup("1", [
      { text: aP, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: plain(negFraction(a)), tag: "sign_error" },
    ], 2)),
    explanationOnCorrect: `The coefficient ${aP} divided by itself is 1, so the variable is isolated.`,
  });
  const correct = `${v} = ${plain(solution)}`;
  const sameSign = rhs.num < 0 === a.num < 0;
  steps.push({
    stepId: "compute_value",
    rowUpdates: [{ slotId: "coefficient_confirmed", row: rowFor(v, val(solution), "success") }],
    prompt: `${rhsP} ÷ ${aP} = ? What is the value of ${v}?`,
    choices: choicesWith(correct, dedup(correct, [
      { text: `${v} = ${plain(divFraction(solution, fromInt(10)))}`, tag: "misplaced_decimal_point" },
      { text: `${v} = ${plain(mulFraction(solution, fromInt(10)))}`, tag: "misplaced_decimal_point" },
      { text: `${v} = ${plain(negFraction(solution))}`, tag: "sign_error" },
      { text: `${v} = ${plain(mulFraction(rhs, a))}`, tag: "multiplied_instead_of_divided" },
    ], 2)),
    explanationOnCorrect: `${rhsP} ÷ ${aP} = ${plain(solution)}. ${sameSign ? "Same signs give a positive result." : "Different signs give a negative result."}`,
  });
  return steps;
}

// ---------- builders ----------

function buildTwoStep(prob: Extract<DecimalPercentProblem, { kind: "twoStep" }>, v: string): SolverInstance {
  const { a, b, c, variableFirst, orientation } = prob;
  const bAbs = b.num < 0 ? negFraction(b) : b;
  const positive = b.num > 0;
  const bP = Pabs(b, D);
  const term1 = variableFirst ? varTermNatural(a, v) : val(b);
  const term2 = variableFirst ? Ksigned(b, D) : varTermForced(a, v);
  const initialRow: GridRow = { cells: assembleRow(term1, term2, val(c), orientation) };
  const initialMarked: GridRow = {
    cells: assembleRow(variableFirst ? term1 : `MARKEDTERM:${term1}`, variableFirst ? `MARKEDTERM:${term2}` : term2, val(c), orientation),
  };
  const cancel = Ksigned(negFraction(b), D, false);
  const cancelRow: GridRow = { cells: assembleRow(variableFirst ? BLANK : cancel, variableFirst ? cancel : BLANK, cancel, orientation, "") };
  const cancelMarked: GridRow = {
    cells: assembleRow(variableFirst ? BLANK : `MARKEDTERM:${cancel}`, variableFirst ? `MARKEDTERM:${cancel}` : BLANK, cancel, orientation, ""),
  };
  const newRhs = subFraction(c, b);
  // The variable term stays in its own column, like the two-step skill.
  const rowFor = (varCell: string, rhsCell: string, highlight?: GridRow["highlight"]): GridRow => ({
    cells: assembleRow(variableFirst ? varCell : BLANK, variableFirst ? BLANK : varCell, rhsCell, orientation),
    ...(highlight ? { highlight } : {}),
  });

  const steps: SolverStep[] = [];
  steps.push({
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes ${positive ? "+" : "-"}${bP} on the side with the variable?`,
    choices: shuffle<Choice>([
      { text: positive ? `Subtracting ${bP} from both sides` : `Adding ${bP} to both sides`, isCorrect: true, misconceptionTag: null },
      { text: `${positive ? "Dividing" : "Multiplying"} both sides by ${bP}`, isCorrect: false, misconceptionTag: "confuses_additive_and_multiplicative_inverse" },
      { text: positive ? `Adding ${bP} to both sides` : `Subtracting ${bP} from both sides`, isCorrect: false, misconceptionTag: "flipped_the_operation" },
    ]),
    explanationOnCorrect: positive ? `Undo addition by subtracting ${bP} from both sides.` : `Undo subtraction by adding ${bP} to both sides.`,
  });
  const opSym = positive ? "-" : "+";
  steps.push({
    stepId: "cancel_constant",
    rowUpdates: [
      { slotId: "__initial__", row: initialMarked },
      { slotId: "cancel_annotation", row: cancelMarked },
    ],
    prompt: `What is ${positive ? bP : `-${bP}`} ${opSym} ${bP}?`,
    choices: choicesWith("0", dedup("0", [
      { text: plain(mulFraction(bAbs, fromInt(2))), tag: "flipped_the_operation" },
      { text: bP, tag: "forgot_to_apply_operation" },
    ], 2)),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  });
  steps.push({
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "simplified", row: rowFor(varTermNatural(a, v), val(newRhs)) }],
    prompt: `What is ${plain(c)} ${opSym} ${bP}?`,
    choices: choicesWith(plain(newRhs), dedup(plain(newRhs), [
      { text: plain(positive ? addFraction(c, bAbs) : subFraction(c, bAbs)), tag: "flipped_the_operation" },
      { text: plain(negFraction(newRhs)), tag: "sign_error" },
      { text: plain(addFraction(newRhs, makeFraction(1, 10))), tag: "arithmetic_slip" },
    ], 2)),
    explanationOnCorrect: `The terms combine to ${plain(newRhs)}. The rest of the equation gets brought down unchanged.`,
  });
  steps.push(...divideSteps(a, newRhs, v, "simplified", rowFor));
  return { initialRow, steps, eqColumnIndex: eqColumnIndexFor(orientation), termAlign: "right" };
}

const sentence = (p: PercentWordProblem) => {
  const t = (f: Fraction | null) => (f ? plain(f) : "");
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
};

type Spot = "TL" | "BL" | "TR" | "BR";
const SPOT_NAME: Record<Spot, string> = { TL: "Top left", BL: "Bottom left", TR: "Top right", BR: "Bottom right" };
const FORMULA = "$\\dfrac{\\text{is}}{\\text{of}} = \\dfrac{\\%}{100}$";

function buildPercentWord(prob: PercentWordProblem, v: string): SolverInstance {
  const { isN, ofN, pct } = prob;
  const n = (f: Fraction) => f.num / f.den;
  // is/of = %/100, with the variable in the unknown's spot.
  const spots: Record<Spot, number | null> = {
    TL: isN ? n(isN) : null,
    BL: ofN ? n(ofN) : null,
    TR: pct ? n(pct) : null,
    BR: 100,
  };
  const unknownSpot: Spot = !isN ? "TL" : !ofN ? "BL" : "TR";
  const solved = buildProportionInstance({ TL: spots.TL, BL: spots.BL, TR: spots.TR, BR: spots.BR }, v);

  // The working proportion fills in one box at a time.
  const placed = new Set<Spot>();
  const box = (sp: Spot) => (sp === unknownSpot && placed.has(sp) ? v : placed.has(sp) ? `${spots[sp]}` : "\\square");
  const setupRow = (): GridRow => ({ cells: [`\\dfrac{${box("TL")}}{${box("BL")}}`, BLANK, "=", `\\dfrac{${box("TR")}}{${box("BR")}}`] });
  // Extra room under the formula, so the cross-multiply loops drawn on the
  // working proportion never touch it.
  const formulaRow: GridRow = { cells: ["\\dfrac{\\text{is}}{\\text{of}}", BLANK, "=", "\\dfrac{\\%}{100}"], marginBottom: 16 };

  const steps: SolverStep[] = [];
  const known = [pct, ofN, isN].filter(Boolean).map((f) => plain(f as Fraction));
  placed.add("BR");
  steps.push({
    stepId: "place_100",
    rowUpdates: [{ slotId: "setup", row: setupRow() }],
    prompt: `We are going to solve this using ${FORMULA} as a proportion. What number goes on the bottom right?`,
    choices: choicesWith("100", dedup("100", [...known.map((k) => ({ text: k, tag: "misplaced_number" })), { text: "1", tag: "misplaced_number" }], 2)),
    explanationOnCorrect: "Percent means \"out of 100,\" so 100 always goes on the bottom right.",
  });

  const placeStep = (sp: Spot, value: string, prompt: string, why: string): SolverStep => {
    placed.add(sp);
    const correct = SPOT_NAME[sp];
    return {
      stepId: `place_${sp.toLowerCase()}`,
      rowUpdates: [{ slotId: "setup", row: setupRow() }],
      prompt,
      // Always in reading order, like the boxes: top left, top right,
      // bottom left, bottom right.
      choices: (["TL", "TR", "BL", "BR"] as Spot[]).map((o) => ({
        text: SPOT_NAME[o],
        isCorrect: o === sp,
        misconceptionTag: o === sp ? null : "misplaced_number",
      })),
      explanationOnCorrect: `${why} So ${value} goes in the ${correct.toLowerCase()}.`,
    };
  };
  const pctStep = () =>
    placeStep("TR", plain(pct!), `The ${plain(pct!)} is next to the % symbol. Where should ${plain(pct!)} go in the equation?`, `The percent goes over 100.`);
  const ofStep = () =>
    placeStep(
      "BL",
      plain(ofN!),
      prob.phrasing === "whatPercent"
        ? `The words "out of" pair with ${plain(ofN!)}. Where should ${plain(ofN!)} go in the equation?`
        : `The word "of" pairs with ${plain(ofN!)}. Where should ${plain(ofN!)} go in the equation?`,
      `The number that goes with "of" goes on the bottom left.`
    );
  const isStep = () =>
    placeStep("TL", plain(isN!), `The word "is" pairs with ${plain(isN!)}. Where should ${plain(isN!)} go in the equation?`, `The number that goes with "is" goes on the top left.`);

  if (prob.phrasing === "whatPercent") {
    steps.push(isStep(), ofStep());
  } else if (prob.phrasing === "isOfWhat") {
    steps.push(pctStep(), isStep());
  } else {
    steps.push(pctStep(), ofStep());
  }

  placed.add(unknownSpot);
  const unknownWhat = unknownSpot === "TR" ? "the percent" : "the number in our answer";
  steps.push({
    stepId: "place_variable",
    rowUpdates: [{ slotId: "setup", row: solved.initialRow }],
    prompt: `Since we don't know ${unknownWhat}, what can we use?`,
    choices: shuffle<Choice>([
      { text: `A variable, ${v}`, isCorrect: true, misconceptionTag: null },
      { text: "0", isCorrect: false, misconceptionTag: "zero_for_unknown" },
      { text: "100", isCorrect: false, misconceptionTag: "misplaced_number" },
    ]),
    explanationOnCorrect: `We use a variable, ${v}, for the number we don't know. It goes in the ${SPOT_NAME[unknownSpot].toLowerCase()}.`,
  });

  // Now it's a proportion - the Proportions skill's own steps, on this line.
  for (const st of solved.steps) steps.push(st);
  const last = steps[steps.length - 1];
  const finalUpdate = last.rowUpdates[last.rowUpdates.length - 1];
  const finalRow = finalUpdate.row as GridRow;
  const answerCell = finalRow.cells.find((c) => c !== v && c !== "=" && c !== BLANK) ?? "";
  const fm = answerCell.match(/^\\dfrac\{(\d+)\}\{(\d+)\}$/);
  let answerText = answerCell;
  let wrapStep = steps.length - 1;
  if (fm) {
    // A fraction answer: also write it as a decimal, on its own line.
    const f = makeFraction(+fm[1], +fm[2]);
    const decimalText = plain(f);
    const fracPlain = `$\\dfrac{${fm[1]}}{${fm[2]}}$`;
    if (/^\d+(\.\d+)?$/.test(decimalText)) {
      steps[steps.length - 1] = {
        ...last,
        explanationOnCorrect: last.explanationOnCorrect.replace("so the answer stays a fraction:", "so first write it as a fraction:"),
        rowUpdates: last.rowUpdates.map((u) => (u === finalUpdate ? { ...u, row: { ...finalRow, highlight: undefined } } : u)),
      };
      steps.push({
        stepId: "answer_as_decimal",
        rowUpdates: [{ slotId: "decimal_answer", row: { cells: finalRow.cells.map((c) => (c === answerCell ? decimalText : c)), highlight: "success" } }],
        prompt: `Now write ${fracPlain} as a decimal.`,
        choices: choicesWith(decimalText, dedup(decimalText, [
          { text: `${fm[1]}.${fm[2]}`, tag: "wrote_numerator_dot_denominator" },
          { text: plain(mulFraction(f, fromInt(10))), tag: "misplaced_decimal_point" },
          { text: plain(divFraction(f, fromInt(10))), tag: "misplaced_decimal_point" },
        ], 2)),
        explanationOnCorrect: `${fm[1]} ÷ ${fm[2]} = ${decimalText}.`,
      });
      wrapStep = steps.length - 1;
      answerText = decimalText;
    } else {
      answerText = `${fm[1]}/${fm[2]}`;
    }
  }
  const wrapUp =
    unknownSpot === "TR"
      ? ` So ${plain(isN!)} is ${answerText}% of ${plain(ofN!)}.`
      : unknownSpot === "TL"
      ? ` So ${plain(pct!)}% of ${plain(ofN!)} is ${answerText}.`
      : ` So ${plain(isN!)} is ${plain(pct!)}% of ${answerText}.`;
  steps[wrapStep] = { ...steps[wrapStep], explanationOnCorrect: steps[wrapStep].explanationOnCorrect + wrapUp };

  return {
    initialRow: formulaRow,
    steps,
    eqColumnIndex: 2,
    termAlign: "right",
    crossLoops: solved.crossLoops ? { slotId: "setup", afterStepId: solved.crossLoops.afterStepId } : undefined,
    problemText: sentence(prob),
  };
}

export function buildDecimalPercentInstance(prob: DecimalPercentProblem, v: string = "x"): SolverInstance {
  if (prob.kind === "twoStep") return buildTwoStep(prob, v);
  return buildPercentWord(prob, v);
}

export function generateDecimalPercentInstance(): SolverInstance {
  return buildDecimalPercentInstance(generateDecimalPercent());
}
