# Status Vocabulary

## Status

Evergreen design document. The single source of truth for how status concepts map to colors, shapes, and operator-friendly labels. Referenced by `DESIGN.md`, `PRODUCT.md`, and the `StatusMark` implementation. When the orchestrator gains a new internal phase or lifecycle state, this document is updated first; everything else follows.

## Why this exists separately

The Stitch six-section format (`Overview`, `Colors`, `Typography`, `Elevation`, `Components`, `Do's and Don'ts`) doesn't have a clean home for a multi-axis mapping table that crosses color, shape, motion, label, internal-name, and operator-name. It also doesn't have a clean home for the Operator-vs-Inspector translation. Both belong here.

## The canonical mapping

Every status concept in the system has exactly one color, one shape, and one operator-language label. The same mapping applies in every component (LED on a station-row, dot on the activity stream, marker on a reviewer row, glyph in a signal cell). Nothing is allowed to invent a new mapping.

| Concept | Color (token) | OKLCH | Shape | Motion | Operator label |
|---|---|---|---|---|---|
| **Live** | `phosphor` | `oklch(0.83 0.16 75)` | Filled square 12×12 | Hard 1.4s tick (0–65% bright, 66–100% dim 0.55) + phosphor bloom | "Live" / "On watch" |
| **Healthy** | `scope-green` | `oklch(0.74 0.16 145)` | Filled circle 12×12 | None | "Settled" |
| **Caution** | `caution-yellow` | `oklch(0.85 0.18 95)` | Filled triangle 14×12, point up | None | "Re-run pending" / "Dirty" |
| **Blocked** | `oxide-red` | `oklch(0.62 0.20 30)` | Solid horizontal bar 14×4 | None | "Hold" / "Blocked" |
| **Deferred** | `indigo-fold` | `oklch(0.55 0.14 280)` | Hollow diamond 12×12, 1.5px stroke | None | "Handed off" / "Deferred to Linear" |
| **Reviewer** | `station-blue` | `oklch(0.62 0.12 240)` | Filled small square 8×8 | None | "Reviewer" |
| **Idle** | `cream-soft` | `oklch(0.55 0.012 65)` | Hollow circle 12×12, 1.5px stroke | None | "Idle" |
| **Skipped** | `cream-soft` (50% opacity) | `oklch(0.55 0.012 65)` | Hollow circle 12×12, 1.5px stroke, 50% opacity | None | "Skipped" |

### Why each shape

The shape choices are not arbitrary. They are picked to be **visually orthogonal** so a color-blind user — or a user looking at a black-and-white screenshot — can read the lifecycle state without color. The shapes deliberately include:

- A **filled square** (live)
- A **filled circle** (healthy)
- A **filled triangle** (caution) — pointing up because that's the universal warning glyph
- A **horizontal bar** (blocked) — visually unambiguous and unlike any of the others
- A **hollow diamond** (deferred) — distinct from the filled lifecycle states because deferred is a handoff, not a state
- A **small filled square** (reviewer) — same family as live's square but smaller, signaling "related but different"
- A **hollow circle** (idle / skipped) — same family as healthy's circle but hollow, signaling "not active"

No two states share the same shape. WCAG 2.2 AA: status is never communicated by color alone.

## Operator vs Inspector translation

In Operator mode, the system surfaces operator-friendly verbs. In Inspector mode, the system surfaces the verbatim internal value. The translation is centralized here.

### `currentPhase`

| Internal | Operator label | Operator-visible? |
|---|---|---|
| `idle` | "Idle" | Yes |
| `refreshing` | "Checking GitHub" | Yes |
| `fixing_checks` | "Fixing failing checks" | Yes |
| `handling_code_rabbit` | "Reviewing CodeRabbit feedback" | Yes |
| `running_special_reviewers` | "Running specialized reviewers" | Yes |
| `resolving_merge_conflicts` | "Resolving merge conflicts" | Yes |
| `resolve_merge_conflicts` | "Resolving merge conflicts" | Yes |
| `recording_results` | "Recording results" | Yes |
| `terminal_cleanup` | "Cleaning up" | Yes |

### `prRuns.phase` × `prRuns.status`

| Internal | Operator label | Operator-visible? |
|---|---|---|
| any phase, `success` | "Completed" | Yes |
| any phase, `failed` | "Failed" | Yes (with full error story) |
| any phase, `blocked` | "Blocked" | Yes (with full error story) |
| any phase, `skipped` | "Skipped" | Yes |
| any phase, `running` | "Running" | Yes |
| any phase, `noop` | (hidden in Operator) | Inspector only |

### `threadDecisions.disposition`

| Internal | Operator label | Operator-visible? |
|---|---|---|
| `fix` | "Fixed" | Yes |
| `false_positive` | "Marked as false positive" | Yes |
| `defer` | "Deferred to Linear" | Yes |

### `lifecycleState`

| Internal | Operator label | Operator-visible? |
|---|---|---|
| `open` | "Open" | Yes |
| `closed` | "Closed" | Yes |
| `merged` | "Merged" | Yes |

### `eventType` (timeline events)

| Internal source | Operator event type | Operator-visible? |
|---|---|---|
| `prRuns` (success) | "Agent run · Completed" | Yes |
| `prRuns` (failed / blocked) | "Failure" (full error story) | Yes |
| `prRuns` (noop) | "Reconciliation · noop" | Inspector only |
| `reviewerRuns` | "Specialized reviewer" | Yes |
| `workflowErrors` | "Error" (full error story) | Yes |
| `artifacts` | folded into the run that produced them | implicit (Inspector also has Outputs panel) |
| `events` (githubEvents) | "GitHub event" | Inspector only (or via filter chip) |
| `events` (manual) | "Manual re-evaluate" | Yes |

## Mapping concepts to colors

The 8-state vocabulary above is the full set. Concepts in the system map to these states; new concepts must reuse an existing state, not invent a new color or shape.

| If the orchestrator emits… | Map it to status… | Notes |
|---|---|---|
| Workflow is running, agent is dispatched | `Live` | The brand color at work. |
| Run completed, no further action expected on this SHA | `Healthy` | "Settled" — the work landed. |
| `dirty: true`, head moved during reconcile, awaiting re-run | `Caution` | The state is recoverable; just needs another pass. |
| `blocked: true`, `blockedReason: <anything>`, retries exhausted | `Blocked` | Operator action required. |
| Thread `disposition === "defer"`, Linear issue created | `Deferred` | Handoff, not failure. |
| `reviewerRuns` row produced, regardless of findings count | `Reviewer` | The reviewer event itself; findings count is a separate signal in the row. |
| `lifecycleState === "open"`, `currentPhase === "idle"`, dirty=false | `Idle` | Nothing to do. |
| `prRuns.status === "skipped"` | `Skipped` | Intentional non-action; visibly dimmer than idle. |

## Implementation notes

- The `<StatusMark variant="..." />` primitive is the only place these shape rules are encoded. Every consumer (station-row LED, activity-stream event dot, reviewer-row marker, signal-cell glyph, indicator in the rack) imports `<StatusMark />` rather than re-implementing the shape.
- The phosphor bloom (`box-shadow`) is part of the live variant only. It is applied via the same component, not as an ad-hoc style on a wrapper.
- `prefers-reduced-motion: reduce` collapses the live tick to a static, full-opacity LED. Status remains conveyed by shape and color.
- Operator-language labels live in a centralized `statusLabel(internalValue, mode)` helper. Components never inline the translation.

## What changes here

- New status concept: add a row to the canonical mapping with a new color (use an OKLCH that's perceptually distinct from the existing palette) and a new shape (must be visually orthogonal to all existing shapes). Update `<StatusMark />`, `DESIGN.md` frontmatter colors, and the `.impeccable/design.json` sidecar's `colorMeta`.
- New internal `currentPhase`: add the operator translation to the `currentPhase` table. No new visual state required unless the new phase needs a distinct color/shape.
- New thread `disposition`: add to the `threadDecisions.disposition` table.

## Out of scope here

- Visual specifications of where the StatusMark *appears* (those are Components in `DESIGN.md`).
- Motion specifications beyond the live tick (those are in `.impeccable/design.json` `extensions.motion`).
- The two-mode system itself: see [operator-and-inspector-modes.md](operator-and-inspector-modes.md).
