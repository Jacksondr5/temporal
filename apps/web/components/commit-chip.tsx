"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy, GitCommit } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * `<CommitChip />` — first-class commit reference primitive (Principle 11
 * in `docs/product/operator-ui-redesign.md` → "Component Patterns" →
 * "Commit chip").
 *
 * Used wherever a commit produced by an agent run needs to be referenced
 * inline: activity-stream event cards, the Inspector Outputs panel, and
 * any future surface that surfaces a commit. The visual treatment is
 * intentionally identical across surfaces so "the agent pushed a commit"
 * always reads the same way.
 *
 * Layout (collapsed):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  ⎇  Pushed commit  7c2f4e1a  ↗                           │
 *   │     fix(rsc): replace manual debounce with useDeferred…  │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   - Distinct surface (`bg-surface-panel-hover`) and a 1px lime accent
 *     border so the chip pops out of its parent card.
 *   - Short SHA in technical mono (JetBrains Mono), copyable on click,
 *     full SHA on hover.
 *   - Message subject in narrative mono (Inter), one line
 *     truncated collapsed, two lines expanded.
 *   - GitHub link via the trailing arrow icon.
 *
 * Inspector mode additionally renders the SHA pair (target HEAD →
 * observed commit) when `targetSha` is supplied and differs from `sha`.
 *
 * Stats are only rendered when supplied AND the chip is expanded — they
 * are detail that belongs to the Story layer, not the surface.
 */

export interface CommitStats {
  additions: number;
  deletions: number;
  files: number;
}

export interface CommitChipProps {
  repoSlug: string;
  sha: string;
  message: string;
  expanded?: boolean;
  mode?: "operator" | "inspector";
  targetSha?: string | null;
  stats?: CommitStats | null;
  className?: string;
}

const SHORT_SHA_LENGTH = 7;
const COPY_FEEDBACK_MS = 1500;

function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

export function CommitChip({
  repoSlug,
  sha,
  message,
  expanded = false,
  mode = "operator",
  targetSha = null,
  stats = null,
  className,
}: CommitChipProps) {
  const [copied, setCopied] = useState(false);

  const githubUrl = `https://github.com/${repoSlug}/commit/${sha}`;
  const trimmedMessage = message.trim();
  // Subject = first non-empty line of the commit message.
  const subjectLine = trimmedMessage.split(/\r?\n/, 1)[0] ?? "";
  const hasMessage = subjectLine.length > 0;

  const showShaPair = mode === "inspector" && !!targetSha && targetSha !== sha;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard access can fail (insecure context, denied permission).
      // Failing silently is acceptable here — the SHA is still visible and
      // the GitHub link gives an alternate copy path.
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border bg-surface-panel-hover px-3 py-2.5",
        // 1px lime accent border keeps the chip visually distinct from the
        // parent card's hairline border. The faint inset ring picks up the
        // canonical Healthy color without overwhelming the row.
        "border-status-healthy/45 ring-1 ring-inset ring-status-healthy/15",
        // Inspector mode uses the desaturated inspector surface so the chip
        // still pops off it without clashing with the more technical layer.
        mode === "inspector" && "bg-surface-inspector",
        className,
      )}
      data-mode={mode}
    >
      <div className="flex items-center gap-2">
        <GitCommit
          className="h-3.5 w-3.5 shrink-0 text-status-healthy"
          aria-hidden
        />
        <span className="text-meta text-muted-foreground">Pushed commit</span>

        {showShaPair ? (
          <ShaPair
            targetSha={targetSha as string}
            sha={sha}
            onCopy={handleCopy}
          />
        ) : (
          <ShaButton sha={sha} onCopy={handleCopy} />
        )}

        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "SHA copied" : "Copy SHA"}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-status-healthy" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open commit on GitHub"
          className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <p
        className={cn(
          "font-mono-narrative text-body text-foreground",
          // Truncate to 1 line collapsed, 2 lines expanded. Per the doc:
          // "one line truncated; the message body grows to two lines and the
          // chip exposes the change-stat summary if available".
          expanded ? "line-clamp-2" : "line-clamp-1",
          !hasMessage && "italic text-muted-foreground",
        )}
        title={hasMessage ? subjectLine : undefined}
      >
        {hasMessage ? subjectLine : "(no message available)"}
      </p>

      {stats && expanded && (
        <p className="text-meta tabular-nums text-muted-foreground">
          <span className="text-status-healthy">+{stats.additions}</span>
          <span className="mx-1">/</span>
          <span className="text-status-blocked">−{stats.deletions}</span>
          <span className="ml-2">
            across {stats.files} {stats.files === 1 ? "file" : "files"}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * The clickable short-SHA, used in the operator mode and as the second leg
 * of the inspector SHA pair. The `title` attribute exposes the full SHA on
 * hover, matching the doc's "full SHA appears on hover" requirement
 * without depending on a tooltip primitive.
 */
function ShaButton({
  sha,
  onCopy,
}: {
  sha: string;
  onCopy: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title={sha}
      className="rounded px-1.5 py-0.5 font-mono text-mono-sm tabular-nums text-foreground transition hover:bg-foreground/5"
    >
      {shortSha(sha)}
    </button>
  );
}

/**
 * Inspector-mode SHA pair: `targetHeadSha → observedCommitSha`. Both legs
 * expose the full SHA on hover; only the observed (right) SHA is the
 * actionable copy target since that is the commit the agent produced.
 */
function ShaPair({
  targetSha,
  sha,
  onCopy,
}: {
  targetSha: string;
  sha: string;
  onCopy: () => void | Promise<void>;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-mono-sm tabular-nums">
      <span
        title={targetSha}
        className="rounded bg-surface-inset px-1.5 py-0.5 text-muted-foreground"
      >
        {shortSha(targetSha)}
      </span>
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <button
        type="button"
        onClick={onCopy}
        title={sha}
        className="rounded px-1.5 py-0.5 text-foreground transition hover:bg-foreground/5"
      >
        {shortSha(sha)}
      </button>
    </span>
  );
}
