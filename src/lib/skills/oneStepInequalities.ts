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
  SIGN_GAP,
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

type Variant = "additive" | "multiplicative";

interface OneStepInequalityInstance {
  variant: Variant;
  a: number; // only meaningful for multiplicative
  b: number; // only meaningful for additive
  form: VariableForm; // only meaningful for multiplicative
  variableFirst: boolean; // only meaningful for additive (term order)
  orientation: Orientation;
  rhs: number;
  boundary: number;
  origSymbol: ComparisonSymbol;
}

export function generateOneStepInequality(): OneStepInequalityInstance {
  const variant: Variant = randBool() ? "additive" : "multiplicative";
  const orientation: Orientation = randBool() ? "expressionLeft" : "expressionRight";
  const origSymbol = randomSymbol(randInt);

  if (variant === "additive") {
    const b = randInt(1, 25) * (randBool() ? 1 : -1);
    let x = randInt(-15, 15);
    while (x === 0) x = randInt(-15, 15);
    const rhs = x + b;
    return {
      variant,
      a: 1,
      b,
      form: "multiply",
      variableFirst: randBool(),
      orientation,
      rhs,
      boundary: x,
      origSymbol,
    };
  }

  // multiplicative - `a` can be negative in both algebraic forms, which is
  // the only change from oneStepEquations.ts needed to get real coverage
  // of the sign-flip case.
  const form: VariableForm = randBool() ? "multiply" : "divide";
  if (form === "multiply") {
    const a = randMultiplyCoefficient();
    let x = randInt(-12, 12);
    while (x === 0) x = randInt(-12, 12);
    const rhs = Math.round(a * x * 100) / 100;
    return { variant, a, b: 0, form, variableFirst: true, orientation, rhs, boundary: x, origSymbol };
  }

  const a = randInt(2, 9) * randSign();
  let k = randInt(-9, 9);
  while (k === 0) k = randInt(-9, 9);
  const x = a * k;
  return { variant, a, b: 0, form, variableFirst: true, orientation, rhs: k, boundary: x, origSymbol };
}

// Shared tail: given the final canonical symbol/boundary, builds the
// (optional) canonicalization step and the graph step. Identical logic to
// the tail of twoStepInequalities.ts's buildSolverInstance - kept inline
// here rather than factored out further, since the two skill files are
// meant to stay independently readable, same as oneStepEquations.ts and
// twoStepEquations.ts already are.
function buildTailSteps(
  variableSymbol: string,
  orientation: Orientation,
  boundary: number,
  afterMultSymbol: ComparisonSymbol,
  needsCanonicalize: boolean
): SolverStep[] {
  const steps: SolverStep[] = [];
  let canonicalSymbol = afterMultSymbol;

  if (needsCanonicalize) {
    canonicalSymbol = flipSymbol(afterMultSymbol);
    const canonicalRow: GridRow = {
      cells: assembleRow(renderConstant(boundary), BLANK, variableSymbol, orientation, canonicalSymbol),
      highlight: "success",
    };

    steps.push({
      stepId: "canonicalize_orientation",
      // Own separate slot, not "final" - so the pre-swap line (e.g.
      // "x < -1") stays visible, and this becomes a genuinely new line
      // below it, rather than silently overwriting it. Same fix already
      // made once for twoStepInequalities.ts.
      rowUpdates: [{ slotId: "canonicalized", row: canonicalRow }],
      prompt: `We want ${variableSymbol} written first. Does the inequality symbol flip when you swap which side ${variableSymbol} is on?`,
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
      explanationOnCorrect: `Swapping which side each quantity sits on flips the symbol: ${boundary} ${plainSymbol(
        afterMultSymbol
      )} ${variableSymbol} becomes ${variableSymbol} ${plainSymbol(canonicalSymbol)} ${boundary}.`,
    });
  }

  const dir = symbolDirection(canonicalSymbol);
  const inc = isInclusive(canonicalSymbol);
  const otherDir = dir === "left" ? "right" : "left";

  steps.push({
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
  });

  return steps;
}

export function buildOneStepInstance(
  ineq: OneStepInequalityInstance,
  variableSymbol: string = "x"
): SolverInstance {
  const { variant, a, b, form, variableFirst, orientation, rhs, boundary, origSymbol } = ineq;
  const needsCanonicalize = orientation === "expressionRight";

  if (variant === "additive") {
    // x + b [sym] c - coefficient is always 1, so this never flips on its
    // own; only the canonicalization step (if needed) can change the
    // symbol here.
    const constantNatural = renderConstant(b);
    const constantForced = renderConstant(b, true);
    const exprTerm1 = variableFirst ? variableSymbol : constantNatural;
    const exprTerm2 = variableFirst ? constantForced : `+${SIGN_GAP}${variableSymbol}`;
    const bIsSecond = variableFirst;

    const initialRow: GridRow = {
      cells: assembleRow(exprTerm1, exprTerm2, renderConstant(rhs), orientation, origSymbol),
    };
    // Marked variant - the constant term gets an x-mark once
    // cancel_constant confirms the two opposites combine to 0, not
    // before, matching twoStepInequalities.ts's same timing rule.
    const markedExprTerm1 = bIsSecond ? exprTerm1 : `MARKEDTERM:${constantNatural}`;
    const markedExprTerm2 = bIsSecond ? `MARKEDTERM:${constantForced}` : exprTerm2;
    const initialRowMarked: GridRow = {
      cells: assembleRow(markedExprTerm1, markedExprTerm2, renderConstant(rhs), orientation, origSymbol),
    };

    const cancelValue = -b;
    const cancelDisplay = renderConstant(cancelValue, true, false);
    const cancelExpr1 = bIsSecond ? BLANK : cancelDisplay;
    const cancelExpr2 = bIsSecond ? cancelDisplay : BLANK;
    const cancelRow: GridRow = {
      cells: assembleRow(cancelExpr1, cancelExpr2, cancelDisplay, orientation, ""),
    };
    // Marked variant for the annotation's own opposite constant.
    const cancelExpr1Marked = bIsSecond ? BLANK : `MARKEDTERM:${cancelDisplay}`;
    const cancelExpr2Marked = bIsSecond ? `MARKEDTERM:${cancelDisplay}` : BLANK;
    const cancelRowMarked: GridRow = {
      cells: assembleRow(cancelExpr1Marked, cancelExpr2Marked, cancelDisplay, orientation, ""),
    };

    // Symbol-only reveal - sign_flip_check_constant's own row (moved
    // before cancel_constant/combine_constant), showing just the symbol
    // with everything else blank, since neither the isolated variable
    // nor the final value are known yet at this point.
    const finalRowSymbolOnly: GridRow = {
      cells: assembleRow(BLANK, BLANK, BLANK, orientation, origSymbol),
    };
    const finalExpr1 = bIsSecond ? variableSymbol : BLANK;
    const finalExpr2 = bIsSecond ? BLANK : variableSymbol;
    const finalRow: GridRow = {
      cells: assembleRow(finalExpr1, finalExpr2, renderConstant(boundary), orientation, origSymbol),
      highlight: needsCanonicalize ? undefined : "success",
    };

    const constantIsPositive = b >= 0;
    const absB = Math.abs(b);
    const constOpSym = constantIsPositive ? "-" : "+";
    const stepOneChoices: Choice[] = [
      {
        text: constantIsPositive ? `Subtracting ${absB} from both sides` : `Adding ${absB} to both sides`,
        isCorrect: true,
        misconceptionTag: null,
      },
      {
        text: `${constantIsPositive ? "Divide" : "Multiply"} both sides by ${absB}`,
        isCorrect: false,
        misconceptionTag: "confuses_additive_and_multiplicative_inverse",
      },
      {
        text: constantIsPositive ? `Adding ${absB} to both sides` : `Subtracting ${absB} from both sides`,
        isCorrect: false,
        misconceptionTag: "flipped_the_operation",
      },
    ];

    const stepOne: SolverStep = {
      stepId: "goal_eliminate_constant",
      rowUpdates: [{ slotId: "cancel_annotation", row: cancelRow }],
      prompt: `What undoes the ${signedWord(b)} on the side with the variable?`,
      choices: shuffle(stepOneChoices),
      explanationOnCorrect: constantIsPositive
        ? `Undo addition by subtracting ${absB} from both sides.`
        : `Undo subtraction by adding ${absB} to both sides.`,
    };

    const stepOneFlip: SolverStep = {
      stepId: "sign_flip_check",
      // Comes BEFORE cancel_constant/combine_constant now - creates the
      // "final" line for the first time, showing just the symbol.
      rowUpdates: [{ slotId: "final", row: finalRowSymbolOnly }],
      prompt: "Does the inequality sign flip here?",
      choices: shuffle([
        { text: "No, the sign stays the same", isCorrect: true, misconceptionTag: null },
        { text: "Yes, the sign flips", isCorrect: false, misconceptionTag: "flipped_when_not_needed" },
      ]),
      explanationOnCorrect: "Adding or subtracting the same value from both sides never flips an inequality.",
    };

    const cancelConstDistractors = dedupNumeric("0", [
      { text: `${2 * absB}`, tag: "flipped_the_operation" },
      { text: `${absB}`, tag: "forgot_to_apply_operation" },
    ]);
    const cancelConstant: SolverStep = {
      stepId: "cancel_constant",
      // Both opposite constants get the x-mark together, once they're
      // confirmed to combine to 0.
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

    const opSymbol = constantIsPositive ? "\u2212" : "+";
    const combineConstDistractors = dedupNumeric(`${boundary}`, [
      { text: `${-boundary}`, tag: "sign_error" },
      { text: `${rhs + b}`, tag: "flipped_the_operation" },
      { text: `${boundary + 1}`, tag: "arithmetic_slip" },
      { text: `${boundary - 1}`, tag: "arithmetic_slip" },
    ]);
    const combineConstant: SolverStep = {
      stepId: "combine_constant",
      // Fills in the isolated variable and final value together on the
      // same line sign_flip_check_constant already created.
      rowUpdates: [{ slotId: "final", row: finalRow }],
      prompt: `${rhs} ${opSymbol} ${absB} = ? What number completes the inequality?`,
      choices: shuffle([
        { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
        { text: combineConstDistractors[0].text, isCorrect: false, misconceptionTag: combineConstDistractors[0].tag },
        { text: combineConstDistractors[1].text, isCorrect: false, misconceptionTag: combineConstDistractors[1].tag },
      ]),
      explanationOnCorrect: `${rhs} ${opSymbol} ${absB} = ${boundary}.`,
    };

    const tailSteps = buildTailSteps(variableSymbol, orientation, boundary, origSymbol, needsCanonicalize);

    return {
      initialRow,
      steps: [stepOne, stepOneFlip, cancelConstant, combineConstant, ...tailSteps],
      eqColumnIndex: eqColumnIndexFor(orientation),
      termAlign: "right",
    };
  }

  // multiplicative: ax [sym] c   or   x/a [sym] c   (b is always 0)
  const variableTermNatural =
    form === "multiply"
      ? renderMultiplyTerm(a, variableSymbol)
      : renderDivideTerm(a, variableSymbol);

  const initialRow: GridRow = {
    cells: assembleRow(variableTermNatural, BLANK, renderConstant(rhs), orientation, origSymbol),
  };

  let stepRow: GridRow;
  let stepRowMarked: GridRow;
  let prompt: string;
  let choices: Choice[];
  let explanationOnCorrect: string;
  let opWord: string;
  let coeffConfirmPrompt: string;
  let coeffConfirmExplanation: string;
  let coeffConfirmDistractorCandidates: { text: string; tag: string }[];

  if (form === "multiply") {
    opWord = "dividing";
    // Unmarked here - eliminate_coefficient's own reveal shows the
    // plain setup; confirmCoefficientOne adds the marked version to
    // this SAME "simplified" line once "coefficient / coefficient = 1"
    // is actually confirmed, not before.
    const divSetupUnmarked = `\\dfrac{${renderMultiplyTerm(a, variableSymbol)}}{${a}}`;
    const divSetupMarked = `MARKEDFRACTION:${a}\u0006${variableSymbol}\u0005${a}`;
    const divRhs = `\\dfrac{${rhs}}{${a}}`;
    stepRow = { cells: assembleRow(divSetupUnmarked, BLANK, divRhs, orientation, origSymbol) };
    stepRowMarked = { cells: assembleRow(divSetupMarked, BLANK, divRhs, orientation, origSymbol) };
    prompt = `What undoes multiplying ${variableSymbol} by ${a}?`;
    choices = [
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
    explanationOnCorrect = `Undo multiplication by dividing both sides by ${a}.`;
    coeffConfirmPrompt = `What is ${a} \u00f7 ${a}?`;
    coeffConfirmExplanation = `The coefficient ${a} divided by itself is 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
  } else {
    opWord = "multiplying";
    const exprIsLeftOfEquals = orientation === "expressionLeft";
    const constantIsLeftOfEquals = orientation === "expressionRight";
    // Unmarked/marked pair, same reasoning as the multiply-form branch.
    const multipliedVarTermUnmarked = exprIsLeftOfEquals
      ? `(${a})\\dfrac{${variableSymbol}}{${a}}`
      : `\\dfrac{${variableSymbol}}{${a}}(${a})`;
    const side = exprIsLeftOfEquals ? "L" : "R";
    const multipliedVarTermMarked = `MARKEDPARENFRACTION:${side}\u0006${a}\u0006${variableSymbol}\u0005${a}`;
    const multipliedConstant = constantIsLeftOfEquals ? `(${a})(${rhs})` : `(${rhs})(${a})`;
    stepRow = { cells: assembleRow(multipliedVarTermUnmarked, BLANK, multipliedConstant, orientation, origSymbol) };
    stepRowMarked = {
      cells: assembleRow(multipliedVarTermMarked, BLANK, multipliedConstant, orientation, origSymbol),
    };
    prompt = `What undoes dividing ${variableSymbol} by ${a}?`;
    choices = [
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
    explanationOnCorrect = `Undo division by multiplying both sides by ${a}.`;
    coeffConfirmPrompt = `What is ${a} multiplied by $\\dfrac{1}{${a}}$?`;
    coeffConfirmExplanation = `${a} and $\\dfrac{1}{${a}}$ are reciprocals, so ${a} \u00d7 $\\dfrac{1}{${a}}$ equals 1, so the variable is isolated.`;
    coeffConfirmDistractorCandidates = [
      { text: `${a}`, tag: "forgot_to_apply_operation" },
      { text: "0", tag: "confuses_division_with_subtraction_pattern" },
      { text: `${-a}`, tag: "sign_error" },
    ];
  }

  const stepOne: SolverStep = {
    stepId: "eliminate_coefficient",
    rowUpdates: [{ slotId: "__initial__", row: stepRow }],
    prompt,
    choices: shuffle(choices),
    explanationOnCorrect,
  };

  const willFlip = a < 0;
  const afterMultSymbol = willFlip ? flipSymbol(origSymbol) : origSymbol;

  // Symbol-only reveal - creates the "final" line for the first time,
  // showing just the resolved (possibly flipped) symbol with everything
  // else blank. Matches the additive variant's own sign_flip_check
  // exactly, which already does this - confirmCoefficientOne (below)
  // then evolves this SAME line, filling in the isolated variable.
  const finalRowSymbolOnly: GridRow = {
    cells: assembleRow(BLANK, BLANK, BLANK, orientation, afterMultSymbol),
  };

  const stepOneFlip: SolverStep = {
    stepId: "sign_flip_check",
    rowUpdates: [{ slotId: "final", row: finalRowSymbolOnly }],
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

  // ---------- Confirm the coefficient becomes 1 ----------
  // Updates BOTH "simplified" (adding the x-marks, now that "coefficient
  // / coefficient = 1" is actually confirmed) and "final" (creating that
  // line for the first time, with the isolated variable AND the already-
  // resolved symbol together - matching oneStepEquations.ts's simpler
  // structure, since sign_flip_check above is a pure question here with
  // no reveal of its own).
  const finalRowVarOnly: GridRow = {
    cells: assembleRow(variableSymbol, BLANK, BLANK, orientation, afterMultSymbol),
  };
  const coeffConfirmDistractors = dedupNumeric("1", coeffConfirmDistractorCandidates);
  const confirmCoefficientOne: SolverStep = {
    stepId: "confirm_coefficient_one",
    rowUpdates: [
      { slotId: "__initial__", row: stepRowMarked },
      { slotId: "final", row: finalRowVarOnly },
    ],
    prompt: coeffConfirmPrompt,
    choices: shuffle([
      { text: "1", isCorrect: true, misconceptionTag: null },
      { text: coeffConfirmDistractors[0].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[0].tag },
      { text: coeffConfirmDistractors[1].text, isCorrect: false, misconceptionTag: coeffConfirmDistractors[1].tag },
    ]),
    explanationOnCorrect: coeffConfirmExplanation,
  };

  const opSymbol = form === "multiply" ? "\u00f7" : "\u00d7";
  const sameSign = (rhs >= 0) === (a >= 0);
  const finalChoices: Choice[] = [
    { text: `${boundary}`, isCorrect: true, misconceptionTag: null },
    { text: `${-boundary}`, isCorrect: false, misconceptionTag: "sign_error" },
    { text: `${rhs}`, isCorrect: false, misconceptionTag: "forgot_final_operation" },
  ];

  const preCanonicalFinalRow: GridRow = {
    cells: assembleRow(variableSymbol, BLANK, renderConstant(boundary), orientation, afterMultSymbol),
    highlight: needsCanonicalize ? undefined : "success",
  };

  const stepTwo: SolverStep = {
    stepId: "compute_value",
    rowUpdates: [{ slotId: "final", row: preCanonicalFinalRow }],
    prompt: `${rhs} ${opSymbol} ${a} = ? What number completes the inequality?`,
    choices: shuffle(finalChoices),
    explanationOnCorrect: sameSign
      ? `${rhs} ${opSymbol} ${a} = ${boundary}. Same signs give a positive result.`
      : `${rhs} ${opSymbol} ${a} = ${boundary}. Different signs give a negative result.`,
  };

  const tailSteps = buildTailSteps(variableSymbol, orientation, boundary, afterMultSymbol, needsCanonicalize);

  return {
    initialRow,
    steps: [stepOne, stepOneFlip, confirmCoefficientOne, stepTwo, ...tailSteps],
    eqColumnIndex: eqColumnIndexFor(orientation),
    termAlign: "right",
  };
}

export function generateOneStepInequalityInstance(): SolverInstance {
  const ineq = generateOneStepInequality();
  return buildOneStepInstance(ineq);
}
