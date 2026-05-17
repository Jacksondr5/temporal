# Machine Room UI Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the already-implemented first-pass operator UI redesign with the new Machine Room design from `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `docs/design/status-vocabulary.md`, and `docs/design/operator-and-inspector-modes.md`.

**Architecture:** Keep the existing Convex read model and the existing Operator/Inspector route split. Treat the current UI as a functional first-pass implementation whose data plumbing mostly exists, then re-skin and restructure the frontend around the new hard-edged operations-room system. Backend work is limited to fixing query/schema gaps discovered during verification, not inventing new product behavior.

**Tech Stack:** Next.js 16 App Router, React, Tailwind v4, shadcn/ui primitives, lucide-react, Convex queries/mutations/subscriptions.

---

## Current State

`main` already contains the first-pass operator UI redesign:

- Backend gaps for PR title, error stacks, activity stream pagination, commit metadata, and list-row signals appear implemented.
- Frontend primitives already exist: `StatusMark`, `StatusRail`, `CommitChip`, `PrRow`, `PrHeaderOperator`, `PrHeaderInspector`, `ActivityStream`, `OutputsPanel`, and the Inspector route.
- The current styling still follows the superseded direction: cyan/blue status colors, Monaspace split fonts, rounded panels, centered `max-w-7xl` shell, blur-backed nav, old shadcn radii, lingering emerald badges, and legacy thread sections outside the unified stream.

The new work should not recreate the app from scratch. It should migrate the existing implementation onto the new design sources of truth.

## Source Of Truth

- Product and information architecture: `PRODUCT.md`
- Visual system and component rules: `DESIGN.md`
- Machine-readable component/motion sidecar: `.impeccable/design.json`
- Status mapping and Operator/Inspector translations: `docs/design/status-vocabulary.md`
- Mode split and route policy: `docs/design/operator-and-inspector-modes.md`
- Superseded doc with still-valid backend notes: `docs/product/operator-ui-redesign.md`

Do not use `docs/product/operator-ui-redesign-linear-prompt.md` as the current implementation plan. It describes the prior direction and is now useful only as evidence of what has already landed.

## Agent Work Chunks

### Task 1: Machine Room Foundation And Shared Primitives

**Owner:** one frontend agent.

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/badge.tsx`
- Modify: `apps/web/components/ui/input.tsx`
- Modify: `apps/web/components/ui/select.tsx`
- Modify: `apps/web/components/ui/tabs.tsx`
- Modify: `apps/web/components/ui/textarea.tsx`
- Modify: `apps/web/components/status-mark.tsx`
- Modify: `apps/web/components/status-rail.tsx`
- Modify: `apps/web/lib/status.ts`
- Modify: `apps/web/app/_playground/status/page.tsx`

**Scope:**
- Replace the superseded cyan/blue tokens with the new warm-charcoal palette from `DESIGN.md`: `charcoal`, `charcoal-up`, `charcoal-deep`, `panel`, `panel-hover`, `rule`, `rule-strong`, `inspector-canvas`, `inspector-panel`, `cream`, `cream-dim`, `cream-soft`, `phosphor`, `scope-green`, `caution-yellow`, `oxide-red`, `indigo-fold`, `station-blue`.
- Replace the type system with the new roles: IBM Plex Sans Condensed for chrome, Inter for prose, JetBrains Mono for technical data. Remove the old Monaspace Argon/Neon narrative/technical split unless the team explicitly decides to keep the files for fallback only.
- Make `--radius` effectively `0`, then audit shared shadcn primitives so buttons, inputs, badges, tabs, selects, dialogs, tooltips, and sheets no longer reintroduce rounded SaaS chrome or decorative shadows.
- Update `StatusMark` to exactly match `docs/design/status-vocabulary.md`: live filled square with phosphor bloom/tick, healthy circle, caution triangle, blocked horizontal bar, deferred hollow diamond, reviewer smaller square, idle/skipped hollow circles.
- Update `StatusRail` to match `.impeccable/design.json` motion. Prefer the new `led-tick` semantics over the old rail sweep where the new docs call for a mechanical LED.
- Update status helpers and comments so they reference `docs/design/status-vocabulary.md` instead of the superseded product doc.
- Expand the playground into a design verification page showing all marks, rails, buttons, filter chips, panels, commit chips, stack trace block, and Operator-vs-Inspector examples.

**Acceptance:**
- `rg "Monaspace|Signal Cyan|surface-canvas: oklch\\(0\\.14|status-live: oklch\\(0\\.8 0\\.16 220|rounded-lg|rounded-xl|shadow-|backdrop-blur|emerald|teal" apps/web` has only intentional exceptions.
- All core tokens use OKLCH and avoid pure black/white.
- `pnpm --filter web lint` and `pnpm --filter web typecheck` pass.

### Task 2: Shell, Navigation, And Home Page Machine Room Pass

**Owner:** one frontend agent.

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/nav.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/home-filter-bar.tsx`
- Modify: `apps/web/components/pr-row.tsx`
- Modify: `apps/web/components/time-ago.tsx`

**Scope:**
- Remove the centered app shell. The design is full-bleed workstation UI; page content should not sit inside `max-w-7xl`.
- Rebuild `Nav` as the full-width rack from `DESIGN.md`: live LED + condensed wordmark + mono subtitle, rectangular route tabs, connection state, mono clock readout. Inspector mode must visibly change the rack through the route, not a quiet badge.
- Rebuild home rows as true `StationRow`: 64px stamp column, flexible PR body, fixed desktop telemetry panel around 460px, no SHAs, hard panel borders, phosphor only for live.
- Make filter chips rectangular and count-bearing. The active chip may use phosphor because it means the active view, not decoration.
- Replace old sentence-style secondary copy where it restates headings. Keep the page focused on "is this PR healthy?"
- Ensure mobile/tablet behavior collapses the telemetry panel below the body without overlapping or shrinking text below the design minimums.

**Acceptance:**
- Home page answers "what is live, blocked, dirty, idle?" from a single scan.
- No rounded card grid, blur nav, centered max-width wrapper, cyan live state, or emerald legacy dot remains on this route.
- Desktop and mobile screenshots show no text overlap.

### Task 3: Operator Detail Narrative And Unified Stream

**Owner:** one frontend agent.

**Files:**
- Modify: `apps/web/app/pr/[repoSlug]/[prNumber]/page.tsx`
- Modify: `apps/web/components/pr-header-operator.tsx`
- Modify: `apps/web/components/signal-stack.tsx`
- Modify: `apps/web/components/reviewer-summary.tsx`
- Modify: `apps/web/components/activity-stream.tsx`
- Modify: `apps/web/components/event-cards.tsx`
- Modify: `apps/web/components/agent-reasoning.tsx`
- Modify: `apps/web/components/commit-chip.tsx`

**Scope:**
- Make Operator detail a story surface, not a hybrid debug page. The current dedicated Review Threads section should either be folded into the stream or converted into a compact "thread decisions" panel only if the docs justify it. Avoid keeping a legacy section just because it already exists.
- Rebuild `PrHeaderOperator` around health-first signal stack, PR title, re-evaluate action, and Inspect link. Hide internal enums and SHAs.
- Rework `ActivityStream` filter chips, timeline spine, event cards, expand/collapse behavior, agent prose, reviewer findings, manual events, and commits against the new panel/rack language.
- Update `CommitChip` to the new spec: charcoal-up inset, scope-green accent, short SHA in phosphor mono, commit subject as body/prose, stats when available, no decorative rounding.
- Update `StackTraceBlock` treatment in event cards: charcoal-deep surface, oxide-red top border, `white-space: pre-wrap`, `overflow-wrap: anywhere`, vertical scroll only, no truncation.
- Preserve all existing query consumption and manual re-evaluate behavior.

**Acceptance:**
- Operator detail has no raw phase enums, workflow IDs, SHAs, provider metadata, token usage, workspace paths, raw JSON, noops, or non-manual GitHub events.
- Agent reasoning reads as body prose capped to the design's reading width.
- Errors render full message and stack without horizontal scroll.
- The page no longer feels like several unrelated debug sections stacked together.

### Task 4: Inspector Mode Rebuild

**Owner:** one frontend agent.

**Files:**
- Modify: `apps/web/app/pr/[repoSlug]/[prNumber]/inspect/page.tsx`
- Modify: `apps/web/components/pr-header-inspector.tsx`
- Modify: `apps/web/components/technical-signal-block.tsx`
- Modify: `apps/web/components/activity-stream.tsx`
- Modify: `apps/web/components/event-cards.tsx`
- Modify: `apps/web/components/outputs-panel.tsx`
- Modify: `apps/web/components/nav.tsx`

**Scope:**
- Implement the three unmistakable Inspector signals: sticky diagonal caution band, caution-colored rack LED/mode chip, mono PR detail title.
- Use the cooler inspector canvas/panel tokens from `DESIGN.md`.
- Rebuild the Technical Signals block as a 4-column instrument panel with verbatim internal values.
- Make Inspector activity cards expose the raw system layer: noops, system GitHub events, SHA pairs, provider metadata, workspace path, token usage, command summaries, raw JSON affordances.
- Rework `OutputsPanel` into the grouped Inspector-only artifacts panel. It should look like a technical output rack, not a generic card list.
- Keep shared primitives (`StatusMark`, `CommitChip`, `StackTraceBlock`, `AgentReasoning`) consistent with Operator; only the chrome and hidden/visible policy changes.

**Acceptance:**
- A screenshot makes Inspector mode obvious without reading the URL.
- Inspector exposes every technical field that Operator hides.
- Operator and Inspector share data order and primitives, but not a compromised component tree.

### Task 5: Policies Surface And Remaining Legacy UI Cleanup

**Owner:** one frontend agent.

**Files:**
- Modify: `apps/web/app/policies/page.tsx`
- Modify: `apps/web/app/policies/[repoSlug]/page.tsx`
- Modify: `apps/web/components/ui/*` as needed
- Modify: `apps/web/components/*` only where stale shared styles remain

**Scope:**
- Restyle policies list into the same rack/row language: enabled/disabled state via status mark/rail, larger repo title, secondary counts as readable text, disabled repos de-emphasized and sorted lower.
- Rebuild policy editor as an operational form: grouped status checks, filter chips for `check_run` vs `commit_status`, specialized reviewers as sharp panels, prompt/glob details behind inline disclosure, sticky bottom save bar when dirty.
- Remove old emerald/zinc pills, rounded cards, generic table chrome, and small 10px labels.
- Audit remaining shadcn defaults that leak rounded/soft SaaS styling into the product.

**Acceptance:**
- Policies routes feel like part of the same Machine Room system, not untouched admin pages.
- Form controls remain keyboard-accessible and clear under WCAG AA contrast.

### Task 6: Backend Verification, Visual QA, And Release Hardening

**Owner:** one full-stack/QA agent after Tasks 1-5 are integrated.

**Files:**
- Inspect: `convex/schema.ts`
- Inspect/modify only if needed: `convex/ui.ts`
- Inspect/modify only if needed: `convex/pullRequests.ts`
- Inspect/modify only if needed: `convex/workflowErrors.ts`
- Inspect/modify only if needed: `apps/orchestrator/src/**`
- Modify: docs only if implementation changes the accepted design behavior

**Scope:**
- Verify the already-landed backend support still satisfies the new UI: PR title, `errorStack`, `commitMessage`, `commitStats`, `latestRunSummary`, paginated `ui.listActivityStreamEvents`, Operator-vs-Inspector filtering.
- Read `convex/_generated/ai/guidelines.md` before changing Convex code.
- Run the app and capture Playwright screenshots for:
  - `/`
  - `/pr/[repoSlug]/[prNumber]`
  - `/pr/[repoSlug]/[prNumber]/inspect`
  - `/policies`
  - `/policies/[repoSlug]`
  - `/_playground/status`
- Test desktop and mobile widths. Confirm no blank canvas, no clipped text, no overlapping telemetry, and no horizontal stack-trace overflow.
- Run color/reflex audit: phosphor means live, no cyan/blue-black, no pure black/white, no decorative gradients, no drop shadows except status glow, no rounded card language.
- Run reduced-motion check and keyboard navigation check for all major controls.

**Acceptance:**
- `scripts/bootstrap-worktree.sh` has been run before project scripts if the worktree was not already bootstrapped.
- `pnpm --filter web lint`, `pnpm --filter web typecheck`, and the relevant build/test command pass.
- Playwright screenshots are attached to the implementation PR or saved under a reviewable artifact path.
- Any backend changes include Convex validator/schema compatibility notes.

## Parallelization

Run Task 1 first. After it lands, Tasks 2, 3, 4, and 5 can run in parallel as long as each agent owns only its listed route/component files and does not change shared primitives. Task 6 runs last as integration QA.

Do not split this into one issue per component. The right farming unit is one coherent surface per capable agent, with Task 1 owning the shared design language and Task 6 owning cross-surface verification.

## Suggested Commit Order

1. `style: establish machine room design foundation`
2. `style: rebuild operator shell and home rows`
3. `style: rebuild operator detail activity stream`
4. `style: rebuild inspector mode`
5. `style: restyle policy surfaces`
6. `test: verify machine room operator UI`

## Risks

- The current implementation comments repeatedly cite the superseded product doc. Agents should update comments as they touch files so future readers do not follow the old design.
- shadcn primitives are a major source of rounded corners, shadows, and soft UI defaults. Task 1 must make those defaults compatible or every downstream task will fight them.
- The current Operator detail still renders legacy thread panels. Decide during Task 3 whether those become stream events or a smaller supporting panel; leaving them unchanged will keep the debug-console smell.
- The new typography asks for IBM Plex Sans Condensed and Inter. If self-hosting fonts is preferred, add local `.woff2` files under `apps/web/public/fonts/`; otherwise use `next/font/google` consistently and document the choice.
- The existing backend activity stream merge is custom. Task 6 should verify pagination correctness with busy PR data rather than relying only on typecheck.
