import { cn } from "../lib/utils";
import type { StatusKind } from "../lib/status";

export type { StatusKind };

/**
 * `<StatusMark />` — the canonical shape+color primitive for the operator UI.
 *
 * Each `StatusKind` owns one shape (rendered as inline SVG so size and stroke
 * stay crisp at any DPI) and one color (driven by the `--status-*` tokens
 * defined in `globals.css`). Per Principle 4 ("Motion encodes liveness"),
 * the mark itself never animates — motion lives on `<StatusRail />`. The
 * color and shape are sufficient on their own to disambiguate the eight
 * canonical states even when the surrounding surface is static.
 *
 * Sizes:
 *   - `sm`: 8px — inline use in dense rows (PR row signal block, etc.).
 *   - `md`: 12px — timeline dots, header signal stack, default.
 */

export type StatusMarkSize = "sm" | "md";

export interface StatusMarkProps {
  status: StatusKind;
  size?: StatusMarkSize;
  className?: string;
  /**
   * Accessible label. Defaults to a sentence-cased version of the kind.
   * Pass `null` to mark the icon as decorative when paired with adjacent
   * text that already names the state.
   */
  label?: string | null;
}

const SIZE_PX: Record<StatusMarkSize, number> = {
  sm: 8,
  md: 12,
};

const STATUS_TEXT_CLASS: Record<StatusKind, string> = {
  live: "text-status-live",
  healthy: "text-status-healthy",
  idle: "text-status-idle",
  caution: "text-status-caution",
  blocked: "text-status-blocked",
  deferred: "text-status-deferred",
  reviewer: "text-status-reviewer",
  skipped: "text-status-skipped",
};

const DEFAULT_LABELS: Record<StatusKind, string> = {
  live: "Live",
  healthy: "Healthy",
  idle: "Idle",
  caution: "Caution",
  blocked: "Blocked",
  deferred: "Deferred",
  reviewer: "Reviewer",
  skipped: "Skipped",
};

export function StatusMark({
  status,
  size = "md",
  className,
  label,
}: StatusMarkProps) {
  const px = SIZE_PX[size];
  const accessibleLabel = label === null ? undefined : (label ?? DEFAULT_LABELS[status]);
  const isDecorative = label === null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        STATUS_TEXT_CLASS[status],
        // Skipped is rendered at reduced opacity ("Hollow circle, dim").
        status === "skipped" && "opacity-60",
        className,
      )}
      // The status color lives in CSS; expose it to consumers that want to
      // tint sibling elements (e.g. a rail) via `var(--mark-color)` without
      // re-deriving the kind.
      style={{ ["--mark-color" as string]: "currentColor" }}
      role={isDecorative ? "presentation" : "img"}
      aria-label={accessibleLabel}
      aria-hidden={isDecorative ? true : undefined}
    >
      <Shape status={status} px={px} />
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Shape primitives. Each is rendered in a square viewBox of side 12 so the
   visual weight stays consistent across kinds; only the size attribute
   changes when scaling up or down.
   ────────────────────────────────────────────────────────────────────── */
function Shape({ status, px }: { status: StatusKind; px: number }) {
  // The SVG viewBox is fixed; px controls the rendered size.
  const common = {
    width: px,
    height: px,
    viewBox: "0 0 12 12",
    "aria-hidden": true,
    focusable: false,
  } as const;

  switch (status) {
    case "live":
      // Filled disc with a darker pupil — visually distinct from the plain
      // filled circles used by `healthy`/`caution` so an at-a-glance scan
      // identifies "this surface is alive" before motion is read.
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5" fill="currentColor" />
          <circle cx="6" cy="6" r="1.5" className="fill-surface-canvas" />
        </svg>
      );

    case "healthy":
    case "caution":
      // Plain filled disc.
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="currentColor" />
        </svg>
      );

    case "idle":
      // Hollow disc.
      return (
        <svg {...common}>
          <circle
            cx="6"
            cy="6"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );

    case "blocked":
      // Filled equilateral-ish triangle pointing up. Slight inset from the
      // edges keeps it visually balanced next to the circles.
      return (
        <svg {...common}>
          <path d="M6 1 L11 10.5 L1 10.5 Z" fill="currentColor" />
        </svg>
      );

    case "deferred":
      // Hollow diamond — communicates "passed elsewhere" / handoff.
      return (
        <svg {...common}>
          <path
            d="M6 1 L11 6 L6 11 L1 6 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );

    case "reviewer":
      // Filled square — the only orthogonal shape; reads as a "tile" of
      // reviewer activity.
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor" />
        </svg>
      );

    case "skipped":
      // Hollow disc; the surrounding span dims it via `opacity-60`.
      return (
        <svg {...common}>
          <circle
            cx="6"
            cy="6"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
  }
}
