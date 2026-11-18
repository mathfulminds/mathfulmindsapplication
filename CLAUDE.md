# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm install          # node_modules is not checked in
npm run dev          # Next.js dev server on http://localhost:3000
npm run build        # production build (also the main type-check)
npm run lint         # eslint (flat config: next core-web-vitals + typescript)
npx tsc --noEmit     # type-check only
```

There is no test runner configured. `validateInstance.ts` mentions stress tests, but they are not in this repo.

Stack: Next.js 16 (App Router, `src/app`), React 19, Tailwind v4, KaTeX (`react-katex`) for rendering math, MathLive (`MathInput.tsx`) for typing math, and Supabase for auth. Import alias: `@/*` → `src/*`.

## Architecture

Mathful Minds is a step-by-step algebra tutor. Each problem is shown as a grid of equation lines. The student answers multiple-choice questions, and each answer reveals or replaces a line.

### Skills → SolverInstance → StepSolver

- **`src/lib/skills/types.ts`** is the central contract. A skill produces a `SolverInstance` made of an `initialRow`, a list of `SolverStep`s, and optional layout flags. Each step has `rowUpdates` keyed by `slotId`: reusing a `slotId` replaces that line in place, and a new one adds a line below. A `Choice` carries a `misconceptionTag`. The comments in this file are the real spec for the layout options (`trackLayout`, `distributeVisual`, `moveArrows`, `marks`, `alignColumns`, and so on). Read them before adding or changing any layout behavior.
- **`src/lib/skills/*.ts`** has one file per skill. Each usually exports two functions:
  - a `build…Instance(params, variable)` that builds the steps from specific numbers.
  - a `generate…Instance()` that picks random numbers and calls the builder.
  Shared helpers live in the `*Core.ts` files (`isolateVariableCore`, `inequalityCore`, `multiStepEquationsCore`) and in `fraction.ts` (exact rational arithmetic).
- **`src/components/solver/StepSolver.tsx`** (about 4k lines) is the single renderer for every skill. It is intentionally skill-agnostic: it must not import skill-specific logic. Skills ask for special rendering through cell-string prefix protocols that StepSolver decodes, such as `PLAINTEXT:`, `GRAPH:` (number lines, produced by `graphChoiceText` in `inequalityCore.ts`), `STACKEDFRACTION:`, `FRACLABEL:`, `MARKEDTERM:` and `LEFTALIGN:`, plus control-character markers for overlines and numbers. Colors embedded with `\textcolor` act as tags too: `moveTag(i)` and `termTag(i)` are near-ink colors that StepSolver detects.
- **`src/lib/display/`** holds post-processing applied to the text of choices and prompts. `signChoices` adds a consistent `+` sign to every choice so the sign never gives the answer away, and `autoMath` turns math found in prose into KaTeX.

### Practice pages

Each `src/app/solve/<skill-slug>/page.tsx` is a thin client component that renders `<StepSolver generate={generateXInstance} skillName=… />`. The skills catalog with its links lives in `src/app/skills/page.tsx`.

### "Solve your own problem" (`src/app/solve/your-problem`, `src/lib/input/`)

1. `parseEquation.ts` parses plain text or LaTeX (from MathLive or OCR) into a structure that keeps **how** each term was written: its order, which side it is on, and whether it was written as `x/4` or `(1/4)x`.
2. `routeEquation.ts` matches the parsed problem to a skill by its *surface shape* and calls that skill's builder. `SKILLS` is the registry. Anything that doesn't fit a skill cleanly gets a "not supported yet" message.
3. `validateInstance.ts` checks the finished instance. Only issues not marked `cosmetic` block a problem from showing.
4. `skillExamples.ts` groups the skills for the example picker. It uses each skill's generator.

Core principle: **never reorder or rewrite the student's problem.** The steps must start from exactly what was typed. When you add a skill that students can type in, wire it into `SKILLS`/routing and into `SKILL_GROUPS`, and also give it a practice page and a link on the Skills page.

The homepage demo (`src/lib/demo/homepageDemo.ts`) calls the real two-step builder with fixed numbers, so changes to that skill show up on the homepage.

### Auth / data

- The Supabase browser client is in `src/lib/supabase/client.ts`. It needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env*` (gitignored).
- The OAuth/email callback is `src/app/auth/callback/route.ts`.
- The schema lives in `supabase/migrations/`: role enum (student/parent/teacher/admin), profiles, parent–student links, classes and enrollments, questions, RLS policies, and an auth trigger that creates profiles.
- There is no middleware or proxy file.

### Styling

Most styling is inline `style={{}}` objects that use the CSS variables defined in `src/app/globals.css`:
- colors: `--ink`, `--ink-soft`, `--paper`, `--card`, `--line`, `--blue`, `--coral`, `--gold`, `--green`
- fonts: `--font-display`, `--font-body`, `--font-mono`

Follow that pattern rather than adding Tailwind classes ad hoc.
