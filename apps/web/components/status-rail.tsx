import { cn } from "../lib/utils";
import type { StatusKind } from "../lib/status";

/**
 * `<StatusRail />` — the hard-edged 4px status rail used by row and card
 * surfaces. Source of truth: `.impeccable/design.json` motion and
 * `docs/design/status-vocabulary.md`.
 *
 * Live rails use the same mechanical 1.4s LED tick as the live mark.
 * Reduced-motion users get a static full-opacity rail.
 */

export type RailMotion =
  | "auto"
  | "none"
  | "tick"
  | "pulse"
  | "sweep"
  | "breath";

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
export function railMotionForStatus(
  status: StatusKind,
): Exclude<RailMotion, "auto"> {
  return status === "live" ? "tick" : "none";
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
        "relative w-1 overflow-hidden",
        STATUS_BG_CLASS[status],
        status === "skipped" && "opacity-60",
        (resolved === "tick" ||
          resolved === "pulse" ||
          resolved === "breath" ||
          resolved === "sweep") &&
          "animate-led-tick",
        className,
      )}
      role="presentation"
      aria-hidden
    />
  );
}
