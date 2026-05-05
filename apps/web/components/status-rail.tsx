import { cn } from "../lib/utils";
import type { StatusKind } from "../lib/status";

/**
 * `<StatusRail />` — the 4px left rail used by row and card surfaces to
 * communicate liveness at the row level (Principle 4 in the redesign doc).
 *
 * Per the doc's "Motion language" table, motion lives at the row/card level
 * and is keyed off the row's status:
 *
 *   - `live`                      → `sweep`  (continuous indeterminate sweep)
 *   - `caution`                   → `breath` (4s slow opacity breath)
 *   - `healthy`/`idle`/`blocked`/
 *     `deferred`/`reviewer`/
 *     `skipped`                   → `none`   (solid bar, no motion)
 *
 * Consumers can override with the `motion` prop when the row needs a state
 * not derivable from `status` alone — the canonical example is
 * "pending/queued", which renders as `pulse` while still wearing the
 * `idle` color.
 */

export type RailMotion = "auto" | "none" | "pulse" | "sweep" | "breath";

export interface StatusRailProps {
  status: StatusKind;
  motion?: RailMotion;
  /** Vertical orientation only. Set the rail's height via `className`. */
  className?: string;
}

const STATUS_BG_CLASS: Record<StatusKind, string> = {
  live: "bg-status-live",
  healthy: "bg-status-healthy",
  idle: "bg-status-idle",
  caution: "bg-status-caution",
  blocked: "bg-status-blocked",
  deferred: "bg-status-deferred",
  reviewer: "bg-status-reviewer",
  skipped: "bg-status-skipped",
};

/**
 * Default motion derived from a status. Exported so consumers can mirror
 * the resolution rules (e.g. when constructing the prop object dynamically).
 */
export function railMotionForStatus(status: StatusKind): Exclude<RailMotion, "auto"> {
  switch (status) {
    case "live":
      return "sweep";
    case "caution":
      return "breath";
    default:
      return "none";
  }
}

export function StatusRail({
  status,
  motion = "auto",
  className,
}: StatusRailProps) {
  const resolved = motion === "auto" ? railMotionForStatus(status) : motion;

  return (
    <div
      // The rail is 4px wide per the redesign doc; consumers control the
      // height by stretching the rail in their own layout (e.g. h-full).
      className={cn(
        "relative w-1 overflow-hidden rounded-[2px]",
        STATUS_BG_CLASS[status],
        // Skipped rails use the same dim treatment as the mark.
        status === "skipped" && "opacity-60",
        // Pulse and breath ride directly on the rail itself — they only
        // modulate opacity, so no overlay element is needed.
        resolved === "pulse" && "animate-rail-pulse",
        resolved === "breath" && "animate-rail-breath",
        className,
      )}
      role="presentation"
      aria-hidden
    >
      {resolved === "sweep" && (
        // Brighter overlay band that slides top-to-bottom continuously.
        // It uses `bg-foreground` at low alpha so it picks up the canonical
        // "highlight" tone regardless of the underlying status color, and
        // the mix-blend keeps it readable on dark and bright bars alike.
        <div
          className="pointer-events-none absolute inset-x-0 h-1/3 animate-rail-sweep bg-foreground/45 mix-blend-screen"
          aria-hidden
        />
      )}
    </div>
  );
}
