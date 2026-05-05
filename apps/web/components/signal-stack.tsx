import type { ReactNode } from "react";
import { StatusMark } from "./status-mark";
import type { StatusKind } from "../lib/status";
import { cn } from "../lib/utils";

/**
 * `<SignalStack />` — multi-line operator status block.
 *
 * Implements Principle 8 ("Surface the signals, do not synthesize the
 * verdict") from `docs/product/operator-ui-redesign.md`. The doc is explicit
 * that the operator status block should be a stack of short lines, one per
 * underlying signal — never a single English sentence that tries to
 * collapse multiple ambiguous signals into one verdict.
 *
 * The component itself is a generic primitive: it takes an ordered list of
 * `Signal`s and renders one row per signal as `<StatusMark /> + text`. The
 * caller is responsible for choosing which signals exist, what canonical
 * status to map them to, and what operator-language text to render — that
 * logic is domain-specific and lives next to the data (e.g. inside
 * `<PrHeaderOperator />`, `<PrRow />`, etc.).
 *
 * Layout:
 *
 *   ◉ Live · Reviewing CodeRabbit feedback
 *   ⚠ Dirty — re-reconcile pending
 *   ◯ Latest run: Completed · 12s ago — fixed 2 of 4 threads
 *
 * - The marks share the small (8px) size so they sit visually as inline
 *   bullets at the start of each line, not as standalone shapes.
 * - The mark itself is rendered decoratively (`label={null}`) because the
 *   adjacent text already names the state in operator language; doubling
 *   the label would be redundant for screen readers.
 * - Lines wrap at the row level if the surrounding column is narrow, but
 *   the mark always stays aligned to the first text line via `items-start`.
 */

export interface Signal {
  /** React key — must be stable across renders. */
  key: string;
  /** Canonical status kind that drives the leading mark's color/shape. */
  status: StatusKind;
  /**
   * The line content, in operator language. Free-form ReactNode so callers
   * can embed `<TimeAgo />`, styled emphasis, separators, etc. without the
   * primitive needing to model every variant.
   */
  text: ReactNode;
}

export interface SignalStackProps {
  signals: Signal[];
  /**
   * Accessible label for the surrounding list. Defaults to a generic
   * "Status signals" — callers should override when the surrounding
   * context warrants something more specific (e.g. "PR status signals").
   */
  ariaLabel?: string;
  className?: string;
}

export function SignalStack({
  signals,
  ariaLabel = "Status signals",
  className,
}: SignalStackProps) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <ul
      role="list"
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-1.5", className)}
    >
      {signals.map((signal) => (
        <li
          key={signal.key}
          className="flex items-start gap-2 text-meta leading-snug text-foreground/85"
        >
          <StatusMark
            status={signal.status}
            size="sm"
            // The mark is a leading bullet for the line; the adjacent text
            // already names the state in operator language, so the mark
            // itself is decorative for assistive tech.
            label={null}
            // Nudge the mark down so it optically aligns with the first
            // text baseline at 13px / 1.4 line-height.
            className="mt-[5px]"
          />
          <span className="min-w-0">{signal.text}</span>
        </li>
      ))}
    </ul>
  );
}
