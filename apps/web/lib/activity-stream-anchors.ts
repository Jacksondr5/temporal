/**
 * Shared anchor scheme for activity-stream events.
 *
 * The activity stream (`docs/product/operator-ui-redesign.md` → "Activity
 * stream") merges four sources — `prRuns`, `reviewerRuns`, `workflowErrors`,
 * and `githubEvents` — into one timeline. Several surfaces want to deep-link
 * directly to a specific event in that stream:
 *
 *   - `<ReviewerSummary />` (this issue) scrolls to the most recent reviewer
 *     run for the current SHA when an operator clicks a reviewer row.
 *   - The activity stream itself will use the same id on the rendered event
 *     card so the click target exists.
 *   - Future surfaces (e.g. notification deep-links, Inspector cross-links,
 *     URL hash navigation) can compose anchors with the same helper instead
 *     of inventing parallel id strings.
 *
 * The event-type discriminator mirrors the `ActivityStreamEventType` union in
 * `convex/ui.ts` so the anchor scheme stays in lockstep with the server-side
 * cursor representation.
 */
export type ActivityStreamEventType =
  | "agent_run"
  | "reviewer_run"
  | "workflow_error"
  | "github_event";

const ANCHOR_PREFIX = "activity";

/**
 * Build the DOM id used to anchor a single activity-stream event. Pair with
 * {@link activityStreamEventHref} when constructing an `<a>` href; pair with
 * the bare return value when applying the id to the event card.
 */
export function activityStreamEventAnchor(
  eventType: ActivityStreamEventType,
  id: string,
): string {
  return `${ANCHOR_PREFIX}-${eventType}-${id}`;
}

/** Build a hash-href targeting the same anchor. */
export function activityStreamEventHref(
  eventType: ActivityStreamEventType,
  id: string,
): string {
  return `#${activityStreamEventAnchor(eventType, id)}`;
}
