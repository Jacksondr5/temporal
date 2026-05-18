import { cn } from "../lib/utils";
import type { StatusKind } from "../lib/status";

export type { StatusKind };

/**
 * `<StatusMark />` — the canonical shape+color primitive for the operator UI.
 *
 * Source of truth: `docs/design/status-vocabulary.md`. Each kind owns one
 * color and one visually orthogonal shape. The live square is the only mark
 * with motion and glow; reduced-motion users get the same square statically.
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
  const accessibleLabel =
    label === null ? undefined : (label ?? DEFAULT_LABELS[status]);
  const isDecorative = label === null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        STATUS_TEXT_CLASS[status],
        size === "sm" && "scale-75",
        className,
      )}
      style={{ ["--mark-color" as string]: "currentColor" }}
      role={isDecorative ? "presentation" : "img"}
      aria-label={accessibleLabel}
      aria-hidden={isDecorative ? true : undefined}
    >
      <Shape status={status} />
    </span>
  );
}

function Shape({ status }: { status: StatusKind }) {
  switch (status) {
    case "live":
      return (
        <span
          className="block h-3 w-3 bg-current animate-led-tick"
          style={{
            boxShadow:
              "0 0 0 1px oklch(0.42 0.016 55), 0 0 12px 2px oklch(0.83 0.16 75 / 0.4)",
          }}
        />
      );

    case "healthy":
      return <span className="block h-3 w-3 rounded-full bg-current" />;

    case "caution":
      return (
        <span
          className="block h-3 w-3.5 bg-current"
          style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
        />
      );

    case "idle":
      return (
        <span className="block h-3 w-3 rounded-full border-[1.5px] border-current bg-transparent" />
      );

    case "blocked":
      return <span className="block h-1 w-3.5 bg-current" />;

    case "deferred":
      return (
        <span className="block h-3 w-3 rotate-45 border-[1.5px] border-current bg-transparent" />
      );

    case "reviewer":
      return <span className="block h-2 w-2 bg-current" />;

    case "skipped":
      return (
        <span className="block h-3 w-3 rounded-full border-[1.5px] border-current bg-transparent opacity-50" />
      );
  }
}
