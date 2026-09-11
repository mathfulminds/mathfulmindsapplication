import type { SolverInstance, SolverStep, Choice, GridRow } from "./types";
import {
  BLANK,
  Orientation,
  VariableForm,
  assembleRow,
  eqColumnIndexFor,
  randBool,
  randInt,
  randMultiplyCoefficient,
  randSign,
  renderConstant,
  renderDivideTerm,
  renderMultiplyTerm,
  shuffle,
  signedWord,
} from "./isolateVariableCore";
import {
  ComparisonSymbol,
  flipSymbol,
  graphChoiceText,
  isInclusive,
  plainSymbol,
  randomSymbol,
  symbolDirection,
  symbolFromDirectionInclusive,
} from "./inequalityCore";

function dedupNumeric(
  correctText: string,
  candidates: { text: string; tag: string }[]
): { text: string; tag: string }[] {
  const seen = new Set([correctText]);
  const out: { text: string; tag: string }[] = [];
  for (const c of candidates) {
    if (out.length === 2) break;
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    out.push(c);
  }
  return out;
}

interface InequalityInstance {
  a: number;
  b: number;
  form: VariableForm;
  variableFirst: boolean;
  orientation: Orientation;
  rhs: number;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

// Same random shape as generateEquation() in twoStepEquations.ts, with two
// deliberate differences: origSymbol replaces "=", and the divide-form
// coefficient `a` is allowed to be negative (randSign()) instead of always
// positive - that's the only thing that needs to vary to get real coverage
// of the sign-flip case in both algebraic forms.
export function generateInequality(): InequalityInstance {
  const form: VariableForm = randBool() ? "multiply" : "divide";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const variableFirst = randBool();
  const b = randInt(1, 20) * (randBool() ? 1 : -1);
  const origSymbol = randomSymbol(randInt);

  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round((a * x + b) * 100) / 100;
    return { a, b, form, variableFirst, orientation, rhs, boundary: x, origSymbol };
  }

  const a = randInt(2, 9) * randSign();
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  const rhs = k + b;
  return { a, b, form, variableFirst, orientation, rhs, boundary: x, origSymbol };
}

export function buildSolverInstance(
  ineq: InequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { a, b, form, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;

  const variableTermNatural =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol)
      : renderDivideTerm(a, variableSymbol);
  const constantBNatural = renderConstant(b);
  const constantBForced = renderConstant(b, true);
  const variableTermForced =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol, true)
      : renderDivideTerm(a, variableSymbol, true);

  const exprTerm1 = variableFirst ? variableTermNatural : constantBNatural;
  const exprTerm2 = variableFirst ? constantBForced : variableTermForced;
  const bIsSecond = variableFirst;

  const initialRow: GridRow = {
    cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation, origSymbol),
  };

  // Same initial row, but with the constant being canceled wrapped in an
  // x-mark (two crossing diagonal lines) - revealed once
  // goal_eliminate_constant is answered, showing the term struck through
  // right where it already sits, alongside the existing cancel
  // annotation below it.
  const markedExprTerm1 = bIsSecond ? exprTerm1 : `MARKEDTERM:${constantBNatural}`;
  const markedExprTerm2 = bIsSecond ? `MARKEDTERM:${constantBForced}` : exprTerm2;
  const initialRowMarked: GridRow = {
    cells: assembleRow(markedExprTerm1, markedExprTerm2, renderConstant(rhs), orientation, origSymbol),
  };

  // --- Step A: eliminate the additive constant (never flips) ---
  const cancelValue = -b;
  const cancelDisplay = renderConstant(cancelValue, true, false);
  const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
  const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
  const cancelRow: GridRow = {
    cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
  };
  // Marked variant - both opposite constants (the original term on the
  // initial row, and its opposite in the cancel annotation) get the
  // x-mark together, once cancel_constant confirms they combine to 0 -
  // not at goal_eliminate_constant, before that's been confirmed.
  const cancelExpr1Marked = bIsSecond ? BLANK : `MARKEDTERM:${cancelDisplay}`;
  const cancelExpr2Marked = bIsSecond ? `MARKEDTERM:${cancelDisplay}` : BLANK;
  const cancelRowMarked: GridRow = {
    cells: assembleRow(cancelExpr1Marked, cancelExpr2Marked, cancelDisplay, orientation, ""),
  };

  const newRhs = Math.round((rhs - b) * 100) / 100;

  const combinedExpr1 = bIsSecond ? variableTermNatural : BLANK;
  const combinedExpr2 = bIsSecond ? BLANK : variableTermNatural;
  // Symbol-only reveal - stepAFlip's row, showing just the resolved
  // symbol with EVERYTHING else blank, including the variable side -
  // it doesn't come down until combine_constant, once the student has
  // actually gone through subtracting the constant. Matches the same
  // pattern already used for sign_flip_check_coefficient below.
  const combinedRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, origSymbol),
  };
  // Full reveal - combine_constant's own row, now filling in BOTH the
  // variable side and the constant value together, since both were
  // hidden until this point.
  const combinedRowFull: GridRow = {
    cells: assembleRow(combinedExpr1, combinedExpr2, renderConstant(newRhs), orientation, origSymbol),
  };

  const constantIsPositive = b >= 0;
  const absB = Math.abs(b);
  const constOpSym = constantIsPositive ? "-" : "+";
  const stepAChoices: Choice[] = [
    {
      text: constantIsPositive
        ? `Subtracting ${absB} from both sides`
        : `Adding ${absB} to both sides`,
      isCorrect: true,
      misconceptionTag: null,
    },
    {
      text: `${constantIsPositive ? "Divide" : "Multiply"} both sides by ${absB}`,
      isCorrect: false,
      misconceptionTag: "confuses_additive_and_multiplicative_inverse",
    },
    {
      text: constantIsPositive
        ? `Adding ${absB} to both sides`
        : `Subtracting ${absB} from both sides`,
      isCorrect: false,
      misconceptionTag: "flipped_the_operation",
    },
  ];

  // Split into three granular steps (goal -> confirm cancellation ->
  // confirm the new value), matching the same pattern already
  // established in twoStepEquations.ts, instead of jumping straight
  // from "choose the operation" to the fully-simplified row in one step.
  const goalConstant: SolverStep = {
    stepId: "goal_eliminate_constant",
    rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
    prompt: `What undoes the ${signedWord(b)} on the side with the variable?`,
    choices: shuffle(stepAChoices),
    explanationOnCorrect: constantIsPositive
      ? `Undo addition by subtracting ${absB} from both sides.`
      : `Undo subtraction by adding ${absB} to both sides.`,
  };

  const cancelConstDistractors = dedupNumeric("0", [
    { text: `${2 * absB}`, tag: "flipped_the_operation" },
    { text: `${absB}`, tag: "forgot_to_apply_operation" },
  ]);
  const cancelConstant: SolverStep = {
    stepId: "cancel_constant",
    // Both opposite constants get the x-mark here, once they're
    // confirmed to combine to 0 - the original term on the initial row,
    // and its opposite in the cancel annotation, together.
    rowUpdates: [
      { slotId: "__initial__", row: initialRowMarked },
      { slotId: "cancel_annotation", row: cancelRowMarked },
    ],
    prompt: `What is ${absB} ${constOpSym} ${absB}?`,
    choices: shuffle([
      { text: "0", isCorrect: true, misconceptionTag: null },
      { text: cancelConstDistractors[0].text, isCorrect: false, misconceptionTag: cancelConstDistractors[0].tag },
      { text: cancelConstDistractors[1].text, isCorrect: false, misconceptionTag: cancelConstDistractors[1].tag },
    ]),
    explanationOnCorrect: "The constants are opposites resulting in 0.",
  };

  const combineConstDistractors = dedupNumeric(`${newRhs}`, [
    { text: `${constOpSym === "-" ? rhs + absB : rhs - absB}`, tag: "flipped_the_operation" },
    { text: `${-newRhs}`, tag: "sign_error" },
    { text: `${newRhs + 1}`, tag: "arithmetic_slip" },
  ]);
  const combineConstant: SolverStep = {
    stepId: "combine_constant",
    rowUpdates: [{ slotId: "simplified", row: combinedRowFull }],
    prompt: `What is ${rhs} ${constOpSym} ${absB}?`,
    choices: shuffle([
      { text: `${newRhs}`, isCorrect: true, misconceptionTag: null },
      { text: combineConstDistractors[0].text, isCorrect: false, misconceptionTag: combineConstDistractors[0].tag },
      { text: combineConstDistractors[1].text, isCorrect: false, misconceptionTag: combineConstDistractors[1].tag },
    ]),
    explanationOnCorrect: `The terms combine to ${newRhs}. The rest of the inequality gets brought down unchanged.`,
  };

  const stepAFlip: SolverStep = {
    stepId: "sign_flip_check_constant",
    // Now comes BEFORE cancel_constant/combine_constant - creates the
    // "simplified" line for the first time, showing just the resolved
    // symbol with the constant value still blank (that's filled in by
    // combine_constant next).
    rowUpdates: [{ slotId: "simplified", row: combinedRowSymbolOnly }],
    prompt: "Does the inequality sign flip here?",
    choices: shuffle([
      { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
      { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
    ]),
    explanationOnCorrect:
      "Adding or subtracting the same value from both sides never flips an inequality.",
  };

  // --- Step B: eliminate the coefficient (flips iff a < 0) ---
  let stepBRow: GridRow;
  let stepBRowMarked: GridRow;
  let stepBPrompt: string;
  let stepBChoices: Choice[];
  let stepBExplanation: string;
  let opWord: string;

  if (form === "multiply") {
    opWord = "dividing";
    // Marked-fraction format: coefficient and variable as separate
    // pieces in the numerator (so the x-mark can wrap just the
    // coefficient), plus the denominator - both get the x-mark since
    // it's the same coefficient value being canceled via division. Only
    // the variable side is marked; the constant side isn't being
    // "canceled" in the same sense, just computed into a new value.
    // Unmarked here - eliminate_coefficient's own reveal shows the
    // plain setup; confirmCoefficientOne adds the marked version to
    // this SAME "simplified" line once "coefficient / coefficient = 1"
    // is actually confirmed, not before.
    const divSetupUnmarked = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divSetupMarked = `MARKEDFRACTION:${a}\u0006${variableSymbol}\u0005${a}`;
    const divRhs = `\\dfrac{${newRhs}}{${a}}`;
    const setupExpr1 = bIsSecond ? divSetupUnmarked : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : divSetupUnmarked;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, divRhs, orientation, origSymbol) };
    const setupExpr1Marked = bIsSecond ? divSetupMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : divSetupMarked;
    stepBRowMarked = { cells: assembleRow(setupExpr1Marked, setupExpr2Marked, divRhs, orientation, origSymbol) };
    stepBPrompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    // "Dividing both sides by |b|" collides with the correct choice when
    // |b| happens to equal a - the same collision already guarded
    // against in twoStepEquations.ts.
    stepBChoices =
      Math.abs(b) !== a
        ? [
            { text: `Dividing both sides by ${a}`, isCorrect: true, misconceptionTag: null },
            {
              text: `Multiplying both sides by ${a}`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
            {
              text: `Dividing both sides by ${Math.abs(b)}`,
              isCorrect: false,
              misconceptionTag: "targets_wrong_term_first",
            },
          ]
        : [
            { text: `Dividing both sides by ${a}`, isCorrect: true, misconceptionTag: null },
            {
              text: `Multiplying both sides by ${a}`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
            {
              text: `Adding ${a} to both sides`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
          ];
    stepBExplanation = `Undo multiplication by dividing both sides by ${a}.`;
  } else {
    opWord = "multiplying";
    const exprIsLeftOfEquals = orientation === "expressionLeft";
    const constantIsLeftOfEquals = orientation === "expressionRight";

    // Marked-paren-fraction format: the outer multiplier and the
    // fraction's own denominator both get the x-mark (same coefficient
    // value canceling via multiplication), while the numerator
    // (containing the variable) stays unmarked. Unmarked variant used
    // for eliminate_coefficient's own reveal - the marked version is
    // added to this same line by confirmCoefficientOne instead, same
    // reasoning as the multiply-form branch above.
    const multipliedVarTermUnmarked = exprIsLeftOfEquals
      ? `(${a})\\dfrac{${variableSymbol}}{${a}}`
      : `\\dfrac{${variableSymbol}}{${a}}(${a})`;
    const side = exprIsLeftOfEquals ? "L" : "R";
    const multipliedVarTermMarked = `MARKEDPARENFRACTION:${side}\u0006${a}\u0006${variableSymbol}\u0005${a}`;
    const multipliedConstant = constantIsLeftOfEquals
      ? `(${a})(${newRhs})`
      : `(${newRhs})(${a})`;
    const setupExpr1 = bIsSecond ? multipliedVarTermUnmarked : BLANK;
    const setupExpr2 = bIsSecond ? BLANK : multipliedVarTermUnmarked;
    stepBRow = { cells: assembleRow(setupExpr1, setupExpr2, multipliedConstant, orientation, origSymbol) };
    const setupExpr1Marked = bIsSecond ? multipliedVarTermMarked : BLANK;
    const setupExpr2Marked = bIsSecond ? BLANK : multipliedVarTermMarked;
    stepBRowMarked = { cells: assembleRow(setupExpr1Marked, setupExpr2Marked, multipliedConstant, orientation, origSymbol) };
    stepBPrompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    stepBChoices =
      Math.abs(b) !== a
        ? [
            { text: `Multiplying both sides by ${a}`, isCorrect: true, misconceptionTag: null },
            {
              text: `Dividing both sides by ${a}`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
            {
              text: `Multiplying both sides by ${Math.abs(b)}`,
              isCorrect: false,
              misconceptionTag: "targets_wrong_term_first",
            },
          ]
        : [
            { text: `Multiplying both sides by ${a}`, isCorrect: true, misconceptionTag: null },
            {
              text: `Dividing both sides by ${a}`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
            {
              text: `Adding ${a} to both sides`,
              isCorrect: false,
              misconceptionTag: "confuses_additive_and_multiplicative_inverse",
            },
          ];
    stepBExplanation = `Undo division by multiplying both sides by ${a}.`;
  }

  const stepB: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "simplified", row: stepBRow }],
    prompt: stepBPrompt,
    choices: shuffle(stepBChoices),
    explanationOnCorrect: stepBExplanation,
  };

  // ---------- Confirm the coefficient becomes 1 ----------
  // Same slot as stepB - evolves the SAME line in place (e.g. "14x/14 =
  // 42/14" becomes just "x"), matching the corrected pattern from
  // twoStepEquations.ts, rather than creating a second line.
  const finalExpr1Confirm = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2Confirm = bIsSecond ? BLANK : variableSymbol;
  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;
  // Symbol-only reveal - this is now stepBFlip's row (moved earlier),
  // creating the "coefficient_confirmed" line for the first time with
  // just the resolved (possibly flipped) symbol, variable position
  // still blank since confirm_coefficient_one hasn't confirmed it yet.
  const coeffConfirmedRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, afterMultSymbol),
  };
  // Full reveal - confirm_coefficient_one's own row, now coming AFTER
  // the flip check, so the symbol is already shown; this just fills in
  // the isolated variable.
  const coeffConfirmedRowFull: GridRow = {
    cells: assembleRow(finalExpr1Confirm, finalExpr2Confirm, BLANK, orientation, afterMultSymbol),
  };
  let coeffConfirmPrompt: string;
  let coeffConfirmExplanation: string;
  let coeffConfirmDistractorCandidates: { text: string; tag: string }[];
  if (form === "multiply") {
    coeffConfirmPrompt = `What is ${a} \u00f7 ${a}?`;
    coeffConfirmExplanation = `The coefficient ${a} divided by itself is 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
  } else {
    coeffConfirmPrompt = `What is ${a} multiplied by $\\dfrac{1}{${a}}$?`;
    coeffConfirmExplanation = `${a} and $\\dfrac{1}{${a}}$ are reciprocals, so ${a} \u00d7 $\\dfrac{1}{${a}}$ equals 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
  }
  const coeffConfirmDistractors = dedupNumeric("1", coeffConfirmDistractorCandidates);
  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    // Now comes AFTER stepBFlip - fills in the isolated variable on the
    // same line the flip-check already created; symbol already shown.
    // Also adds the x-marks to the "simplified" line here, now that
    // "coefficient / coefficient = 1" is actually confirmed - not
    // before, on eliminate_coefficient's own reveal.
    rowUpdates: [
      { slotId: "simplified", row: stepBRowMarked },
      { slotId: "coefficient_confirmed", row: coeffConfirmedRowFull },
    ],
    prompt: coeffConfirmPrompt,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: coeffConfirmDistractors[0].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[0].tag },
      { text: coeffConfirmDistractors[1].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[1].tag },
    ]),
    explanationOnCorrect: coeffConfirmExplanation,
  };

  const stepBFlip: SolverStep = {
    stepId: "sign_flip_check_coefficient",
    // Now comes BEFORE confirm_coefficient_one - creates the
    // "coefficient_confirmed" line for the first time, showing just the
    // resolved symbol with the variable position still blank.
    rowUpdates: [{ slotId: "coefficient_confirmed", row: coeffConfirmedRowSymbolOnly }],
    prompt: `Does the inequality sign flip here? (${opWord} both sides by ${a})`,
    choices: shuffle([
      {
        text: willFlip ? "Yes, the sign flips" : "No, the sign stays the same",
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: willFlip ? "No, the sign stays the same" : "Yes, the sign flips",
        isCorrect: false,
        misconceptionTag: willFlip ? "forgot_to_flip_sign" : "flipped_when_not_needed",
      },
    ]),
    explanationOnCorrect: willFlip
      ? `Multiplying or dividing both sides by a negative number (${a}) flips the inequality sign.`
      : `${a} is positive, so ${opWord} both sides by it does not flip the inequality sign.`,
  };

  // --- Step C: compute the resulting value ---
  const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
  const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
  const needsCanonicalize = orientation === "expressionRight";

  const finalRow: GridRow = {
    cells: assembleRow(finalExpr1, finalExpr2, renderConstant(boundary), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const sameSign = (newRhs >= 0) === (a >= 0);
  const stepCChoices: Choice[] = [
    { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
    { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `${newRhs}`, isCorrect: false, misconceptionTag: "forgot_final_operation" },
  ];

  const stepC: SolverStep = {
    stepId: "compute_value",
    // Merges back onto confirm_coefficient_one's own line when the sign
    // never actually flipped - nothing new to reveal there, so no need
    // for a separate line. Only gets its own new line when willFlip is
    // true, matching the earlier request that a flipped symbol should
    // appear fresh rather than mutate an already-visible line.
    // Always merges back onto confirm_coefficient_one's own line - the
    // ONLY thing that ever adds a genuinely new line is canonicalize_
    // orientation, when the variable needs to swap sides. A coefficient
    // flip by itself (no side-swap needed) stays on this same line.
    rowUpdates: [{ slotId: "coefficient_confirmed", row: finalRow }],
    prompt: `${newRhs} ${opSymbol} ${a} = ? What number completes the inequality?`,
    choices: shuffle(stepCChoices),
    explanationOnCorrect: sameSign
      ? `${newRhs} ${opSymbol} ${a} = ${boundary}. Same signs give a positive result.`
      : `${newRhs} ${opSymbol} ${a} = ${boundary}. Different signs give a negative result.`,
  };

  const steps: SolverStep[] = [
    goalConstant,
    stepAFlip,
    cancelConstant,
    combineConstant,
    stepB,
    stepBFlip,
    confirmCoefficientOne,
    stepC,
  ];

  // --- Step D (conditional): canonicalize so the variable reads first ---
  // Only reached when orientation is "expressionRight" - the variable
  // landed on the right of the symbol (e.g. "boundary > x"). Reuses the
  // SAME orientation value in assembleRow (not "expressionLeft") so the
  // grid's single instance-level eqColumnIndex stays valid for every row -
  // only which VALUES occupy the constantCell/exprCell argument slots
  // changes, not the column layout itself.
  let canonicalSymbol = afterMultSymbol;
  if (needsCanonicalize) {
    canonicalSymbol = flipSymbol(afterMultSymbol);
    const canonicalRow: GridRow = {
      cells: assembleRow(renderConstant(boundary), BLANK, variableSymbol, orientation, canonicalSymbol),
      highlight: "success",
    };

    const canonicalize: SolverStep = {
      stepId: "canonicalize_orientation",
      rowUpdates: [{ slotId: "canonicalized", row: canonicalRow }],
      prompt: `The goal is to get variable on the left. Do we flip the sign when we swap sides?`,
      choices: shuffle([
        {
          text: "Yes - the symbol flips when you swap sides",
          isCorrect: true,
          misconceptionTag: null,
        },
        {
          text: "No - the symbol stays the same",
          isCorrect: false,
          misconceptionTag: "forgot_symbol_flips_on_side_swap",
        },
      ]),
      explanationOnCorrect: "We flip the inequality signs when we swap the sides of the inequality.",
    };

    steps.push(canonicalize);
  }

  // --- Final step: graph the solution on a number line ---
  const dir = symbolDirection(canonicalSymbol);
  const inc = isInclusive(canonicalSymbol);
  const otherDir = dir === "left" ? "right" : "left";

  const graphStep: SolverStep = {
    stepId: "graph_solution",
    rowUpdates: [],
    prompt: `Which number line shows ${variableSymbol} ${plainSymbol(canonicalSymbol)} ${boundary}?`,
    choices: shuffle([
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, inc)),
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(dir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_boundary",
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_direction",
      },
      {
        text: graphChoiceText(boundary, symbolFromDirectionInclusive(otherDir, !inc)),
        isCorrect: false,
        misconceptionTag: "misreads_inequality_graph",
      },
    ]),
    explanationOnCorrect: `${inc ? "A closed" : "An open"} circle at ${boundary}, shaded to the ${dir}, matches ${variableSymbol} ${plainSymbol(
      canonicalSymbol
    )} ${boundary}.`,
  };

  steps.push(graphStep);

  return {
    initialRow,
    steps,
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateTwoStepInequalityInstance(): SolverInstance {
  const ineq = generateInequality();
  return buildSolverInstance(ineq);
}
