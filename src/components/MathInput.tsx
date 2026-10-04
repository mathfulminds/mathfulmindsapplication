"use client";

// A "what you see is what you get" math input, built on MathLive
// (https://mathlive.io, MIT license). Typing "/" builds a real stacked
// fraction, "^" raises an exponent box, and the toolbar buttons insert
// roots, absolute-value bars, parentheses, etc. with the cursor already
// inside the first empty box - so a student sees the problem exactly the
// way it looks on paper while typing it.
//
// The field's value is LaTeX, which src/lib/input/parseEquation.ts
// already understands (it's the same format photo/OCR services return).
//
// MathLive is a browser-only web component, so it's loaded on the client
// inside useEffect - never during server rendering.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

// The subset of MathLive's element API this component uses.
interface MathfieldLike extends HTMLElement {
  value: string;
  insert: (latex: string, options?: Record<string, unknown>) => boolean;
  position: number;
  getValue: (start: number, end: number, format: string) => string;
  executeCommand: (command: unknown) => boolean;
  focus: () => void;
  [option: string]: unknown;
}

export interface MathInputHandle {
  setValue: (latex: string) => void;
  focus: () => void;
}

interface Props {
  onChange: (latex: string) => void;
  onSubmit: () => void;
  ariaLabel?: string;
}

// Button definitions. `label` is rendered with KaTeX so each button looks
// like the math it inserts; `insert` is MathLive's insertion template:
//   #@ = the thing just before the cursor (e.g. "3" becomes the numerator)
//   #0 = whatever is selected (or an empty box if nothing is)
//   #? = an empty box to type into
interface ToolButton {
  label: string;
  insert: string;
  aria: string;
}
const GROUPS: { name: string; buttons: ToolButton[] }[] = [
  {
    name: "Operations",
    buttons: [
      { label: "+", insert: "+", aria: "plus" },
      { label: "-", insert: "-", aria: "minus" },
      // "*" (not "×") so it can't be mistaken for the variable x.
      { label: "\\ast", insert: "\\ast", aria: "times" },
      { label: "\\div", insert: "\\div", aria: "divided by" },
    ],
  },
  {
    name: "Compare",
    buttons: [
      { label: "=", insert: "=", aria: "equals" },
      { label: "\\neq", insert: "\\ne", aria: "not equal to" },
      { label: "<", insert: "<", aria: "less than" },
      { label: ">", insert: ">", aria: "greater than" },
      { label: "\\leq", insert: "\\le", aria: "less than or equal to" },
      { label: "\\geq", insert: "\\ge", aria: "greater than or equal to" },
    ],
  },
  {
    name: "Group",
    buttons: [
      { label: "(\\square)", insert: "\\left(#0\\right)", aria: "parentheses" },
      { label: "|\\square|", insert: "\\left|#0\\right|", aria: "absolute value" },
      { label: "\\dfrac{\\square}{\\square}", insert: "\\frac{#@}{#?}", aria: "fraction" },
    ],
  },
  {
    name: "Powers & roots",
    buttons: [
      { label: "\\square^{\\square}", insert: "#@^{#?}", aria: "exponent" },
      { label: "\\sqrt{\\square}", insert: "\\sqrt{#0}", aria: "square root" },
      { label: "\\sqrt[3]{\\square}", insert: "\\sqrt[3]{#0}", aria: "cube root" },
      { label: "\\sqrt[4]{\\square}", insert: "\\sqrt[4]{#0}", aria: "fourth root" },
      { label: "\\pi", insert: "\\pi", aria: "pi" },
    ],
  },
];

// Typed shortcuts. MathLive's defaults turn dozens of letter combinations
// into symbols (e.g. "in" -> ∈), which would mangle a student typing "2in"
// or "ab". Only the few that match what a student means are kept.
const INLINE_SHORTCUTS: Record<string, string> = {
  ">=": "\\ge",
  "<=": "\\le",
  "!=": "\\ne",
  "=<": "\\le",
  "=>": "\\ge",
  pi: "\\pi",
  sqrt: "\\sqrt{#0}",
  cbrt: "\\sqrt[3]{#0}",
};

const EXITS_DENOMINATOR = new Set(["=", "<", ">", "+", "-", "!"]);
const COMBINE_WITH_EQUALS: Record<string, string> = { "<": "\\le", ">": "\\ge", "!": "\\ne", "\\lt": "\\le", "\\gt": "\\ge" };

// True when the cursor sits right after the last thing in a fraction's
// (non-empty) denominator. MathLive doesn't expose this publicly, so this
// reads its internal model - wrapped in try/catch, so if a future MathLive
// version changes those internals, typing simply behaves normally (the
// student can still press the right arrow to leave a denominator).
function cursorAtEndOfDenominator(field: MathfieldLike): boolean {
  try {
    type Atom = { type: string; parent?: Atom & { below?: Atom[] }; parentBranch?: string };
    const model = (field as unknown as { _mathfield?: { model?: { at: (o: number) => Atom } } })._mathfield?.model;
    const atom = model?.at(field.position as unknown as number);
    if (!atom || atom.type === "first" || atom.type === "placeholder") return false; // empty denominator
    if (atom.parent?.type !== "genfrac" || atom.parentBranch !== "below") return false;
    const below = atom.parent.below ?? [];
    return below[below.length - 1] === atom;
  } catch {
    return false;
  }
}

const MathInput = forwardRef<MathInputHandle, Props>(function MathInput({ onChange, onSubmit, ariaLabel }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldLike | null>(null);
  const [ready, setReady] = useState(false);
  // Latest callbacks, so the listeners attached once at mount never go stale.
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    let cancelled = false;
    let field: MathfieldLike | null = null;

    (async () => {
      const { MathfieldElement } = await import("mathlive");
      if (cancelled || !hostRef.current) return;
      // Use the KaTeX fonts the site already loads (MathLive's fonts are
      // the same KaTeX fonts), and no keypress sounds.
      MathfieldElement.fontsDirectory = null;
      MathfieldElement.soundsDirectory = null;

      field = new MathfieldElement() as unknown as MathfieldLike;
      field.addEventListener("input", (e: Event) => {
        const inputType = (e as InputEvent).inputType;
        if (inputType === "insertLineBreak") {
          onSubmitRef.current();
          return;
        }
        onChangeRef.current(field!.value);
      });
      field.addEventListener("beforeinput", (e: Event) => {
        const ie = e as InputEvent;
        if (ie.inputType !== "insertText" || !ie.data) return;
        // Typing "*" should give the same "*" the toolbar button does.
        if (ie.data === "*") {
          e.preventDefault();
          field!.insert("\\ast");
          onChangeRef.current(field!.value);
          return;
        }
        // Typing straight through "x/4=5" should give x/4 = 5, not x over
        // "4=5": a relation, "+" or "-" typed at the END of a finished
        // denominator closes the fraction first. (A "-" in an EMPTY
        // denominator stays inside, so "x/-3" still means x over -3.)
        if (EXITS_DENOMINATOR.has(ie.data) && cursorAtEndOfDenominator(field!)) {
          field!.executeCommand("moveAfterParent");
        }
        // "<" then "=" -> ≤ (also > and !). MathLive does this itself, but
        // not when the first symbol was the one that closed a fraction.
        if (ie.data === "=") {
          const pos = field!.position;
          const prev = pos > 0 ? field!.getValue(pos - 1, pos, "latex").trim() : "";
          const merged = COMBINE_WITH_EQUALS[prev];
          if (merged) {
            e.preventDefault();
            field!.executeCommand("deleteBackward");
            field!.insert(merged);
            onChangeRef.current(field!.value);
          }
        }
      });

      hostRef.current.appendChild(field);
      // Options can only be set once the field is attached to the page.
      const configure = () => {
        if (!field) return;
        field.mathVirtualKeyboardPolicy = "manual"; // the toolbar replaces it
        field.popoverPolicy = "off";
        field.smartFence = true;
        field.smartSuperscript = true;
        field.inlineShortcuts = INLINE_SHORTCUTS;
        field.menuItems = [];
        field.setAttribute("aria-label", ariaLabel ?? "Math input");
        field.className = "math-input-field";
      };
      try {
        configure();
      } catch {
        field.addEventListener("mount", configure, { once: true });
      }
      fieldRef.current = field;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      field?.remove();
      fieldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setValue(latex: string) {
      const f = fieldRef.current;
      if (!f) return;
      f.value = latex;
      onChangeRef.current(f.value);
    },
    focus() {
      fieldRef.current?.focus();
    },
  }));

  function press(b: ToolButton) {
    const f = fieldRef.current;
    if (!f) return;
    f.insert(b.insert, { selectionMode: "placeholder", focus: true });
    f.focus();
    onChangeRef.current(f.value);
  }

  function clear() {
    const f = fieldRef.current;
    if (!f) return;
    f.value = "";
    f.focus();
    onChangeRef.current("");
  }

  return (
    <div>
      <style>{`
        .math-input-host math-field {
          display: block;
          width: 100%;
          box-sizing: border-box;
          min-height: 64px;
          font-size: 26px;
          padding: 10px 14px;
          border: 1.5px solid var(--line);
          border-radius: 10px;
          background: var(--paper);
          color: var(--ink);
          --caret-color: var(--blue);
          --selection-background-color: rgba(46,111,163,0.18);
          --contains-highlight-background-color: rgba(46,111,163,0.06);
          --placeholder-color: var(--ink-soft);
          --smart-fence-color: var(--ink-soft);
        }
        .math-input-host math-field:focus-within {
          outline: none;
          border-color: var(--blue);
          box-shadow: 0 0 0 3px rgba(46,111,163,0.15);
        }
        .math-input-host math-field::part(virtual-keyboard-toggle),
        .math-input-host math-field::part(menu-toggle) {
          display: none;
        }
        .math-tool {
          border: 1px solid var(--line);
          background: var(--card);
          border-radius: 8px;
          min-width: 44px;
          height: 44px;
          padding: 0 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
          cursor: pointer;
          font-size: 15px;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .math-tool:hover { background: var(--paper); border-color: var(--blue); }
        .math-tool:active { transform: translateY(1px); }
        .math-tool .katex { font-size: 1.05em; }
        .math-tool.small-math .katex { font-size: 0.9em; }
        .math-tool.frac-math .katex { font-size: 0.72em; }
      `}</style>

      <div ref={hostRef} className="math-input-host" style={{ minHeight: 64 }}>
        {!ready && (
          <div
            style={{
              minHeight: 64,
              border: "1.5px solid var(--line)",
              borderRadius: 10,
              background: "var(--paper)",
            }}
          />
        )}
      </div>

      <div
        role="toolbar"
        aria-label="Math symbols"
        style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}
      >
        {GROUPS.map((g) => (
          <div key={g.name} role="group" aria-label={g.name} style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {g.buttons.map((b) => (
              <button
                key={b.aria}
                type="button"
                className={`math-tool${/frac/.test(b.label) ? " frac-math" : /\^|sqrt/.test(b.label) ? " small-math" : ""}`}
                aria-label={`Insert ${b.aria}`}
                title={b.aria}
                // Keep focus (and the cursor position) in the math field.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => press(b)}
              >
                <InlineMath math={b.label} />
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          className="math-tool"
          aria-label="Clear the problem"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          style={{ fontSize: 13, fontWeight: 700, padding: "0 12px", marginLeft: "auto" }}
        >
          Clear
        </button>
      </div>
    </div>
  );
});

export default MathInput;
