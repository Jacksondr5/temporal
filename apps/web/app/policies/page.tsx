"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { ChevronRight, FolderGit2 } from "lucide-react";
import { StatusMark } from "../../components/status-mark";
import { StatusRail } from "../../components/status-rail";
import { cn } from "../../lib/utils";

/**
 * Policies list — see `docs/product/operator-ui-redesign.md`
 * → "Per-Screen Direction" → "Policies list".
 *
 * The list adopts the same row pattern as `<PrRow />`: a 4px status rail on
 * the left, a larger title, and a single signal line that surfaces the
 * counts as a sentence ("12 status checks · 3 fixable · 2 specialized
 * reviewers · 4 active PRs"). Disabled repos render at lower opacity and
 * sort below the enabled set, so the operator's eye lands first on the
 * repos that are actually being reconciled. Capped counts no longer expose
 * an inline `+` glyph — the cap is communicated via a hover tooltip on the
 * affected count tokens.
 */

const SKELETON_ROW_COUNT = 4;

interface RepoRowData {
  _id: string;
  slug: string;
  enabled: boolean;
  policy: { specializedReviewers: { id: string }[] } | null;
  statusCheckCount: number;
  statusCheckCountIsCapped: boolean;
  enabledStatusCheckCount: number;
  enabledStatusCheckCountIsCapped: boolean;
  activePrCount: number;
  activePrCountIsCapped: boolean;
}

/** Canonical sort: enabled first (by slug), disabled at the bottom. */
function sortRepos<T extends { enabled: boolean; slug: string }>(
  repos: readonly T[],
): T[] {
  return [...repos].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });
}

export default function PoliciesListPage() {
  const repos = useQuery(api.ui.listReposWithPolicies);

  const sorted = useMemo(() => sortRepos(repos ?? []), [repos]);

  const isLoading = repos === undefined;
  const isEmpty = !isLoading && sorted.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-foreground">
            Repo Policies
          </h1>
          <p className="mt-1 text-meta text-muted-foreground">
            Manage check classifications, specialized reviewers, and automation
            settings per repository.
          </p>
        </div>
        {repos && (
          <span className="text-meta tabular-nums text-muted-foreground">
            {repos.length} {repos.length === 1 ? "repo" : "repos"}
          </span>
        )}
      </div>

      <section
        aria-label="Repository policies"
        className="overflow-hidden rounded-none border border-border-hairline bg-surface-panel"
      >
        {isLoading && (
          <ul className="divide-y divide-border-hairline">
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <li key={i}>
                <RepoRowSkeleton />
              </li>
            ))}
          </ul>
        )}

        {isEmpty && <PoliciesEmptyState />}

        {!isLoading && !isEmpty && (
          <ul className="divide-y divide-border-hairline">
            {sorted.map((repo) => (
              <li key={repo._id}>
                <RepoRow repo={repo} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RepoRow({ repo }: { repo: RepoRowData }) {
  // Enabled repos use the canonical `idle` mark (hollow circle, slate),
  // disabled repos use `skipped` (the dim variant). Both are static — the
  // policies list doesn't have a "live" concept of its own, so the rail's
  // role here is to mark enabled state at a glance, not to convey motion.
  const status = repo.enabled ? "idle" : "skipped";
  const reviewerCount = repo.policy?.specializedReviewers.length ?? 0;

  // The aria-label folds in any capped counts so screen-reader users get
  // the same "count + cap" signal that sighted users get from the visual
  // tooltip below. Without this, the cap information would be invisible to
  // assistive tech.
  const ariaLabel = buildRowAriaLabel(repo, reviewerCount);

  return (
    <Link
      href={`/policies/${encodeURIComponent(repo.slug)}`}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex items-stretch gap-4 px-4 py-3 transition-colors hover:bg-surface-panel-hover",
        !repo.enabled && "opacity-60",
      )}
    >
      <StatusRail status={status} className="self-stretch" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Title line — the repo slug is the primary identifier; sized
            up to text-title so it reads as the row's primary content. */}
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className="min-w-0 flex-1 truncate text-title font-medium text-foreground"
            title={repo.slug}
          >
            {repo.slug}
          </span>
        </div>

        {/* Signal line — status mark + enabled label, then a sentence of
            counts, separated by middle-dots. Each capped token carries a
            tooltip explaining the cap rather than showing an inline `+`. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <StatusMark status={status} size="sm" label={null} />
            <span
              className={cn(
                repo.enabled ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {repo.enabled ? "Enabled" : "Disabled"}
            </span>
          </span>
          <Separator />
          <CountToken
            value={repo.statusCheckCount}
            capped={repo.statusCheckCountIsCapped}
            label={statusCheckLabel}
          />
          <Separator />
          <CountToken
            value={repo.enabledStatusCheckCount}
            capped={repo.enabledStatusCheckCountIsCapped}
            label={fixableLabel}
          />
          <Separator />
          <CountToken
            value={reviewerCount}
            capped={false}
            label={reviewerLabel}
          />
          <Separator />
          <CountToken
            value={repo.activePrCount}
            capped={repo.activePrCountIsCapped}
            label={activePrLabel}
          />
        </div>
      </div>

      <ChevronRight
        className="my-auto size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary"
        aria-hidden
      />
    </Link>
  );
}

function Separator() {
  return (
    <span aria-hidden className="text-muted-foreground/40">
      ·
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Count tokens

   The capped variant gets a dotted underline + a `title` attribute so
   hovering reveals the cap explanation. We use the native browser tooltip
   (rather than the styled Base UI <Tooltip />) because the row itself is a
   `<Link>`, and embedding an interactive tooltip trigger inside an anchor
   would produce nested-interactive-element semantics. The native title
   attribute is valid HTML in this context and still satisfies the redesign
   goal of "a tooltip rather than an inline glyph."
   ────────────────────────────────────────────────────────────────────── */

const CAPPED_TOOLTIP =
  "Display limit reached — the actual count may be higher.";

function CountToken({
  value,
  capped,
  label,
}: {
  value: number;
  capped: boolean;
  label: (n: number) => string;
}) {
  const text = label(value);
  if (!capped) {
    return (
      <span className="text-meta text-muted-foreground tabular-nums">
        {text}
      </span>
    );
  }
  return (
    <span
      title={CAPPED_TOOLTIP}
      className="cursor-help text-meta text-muted-foreground tabular-nums underline decoration-muted-foreground/40 decoration-dotted underline-offset-[3px]"
    >
      {text}
    </span>
  );
}

function statusCheckLabel(n: number): string {
  return `${n} status check${n === 1 ? "" : "s"}`;
}

function fixableLabel(n: number): string {
  return `${n} fixable`;
}

function reviewerLabel(n: number): string {
  return `${n} specialized reviewer${n === 1 ? "" : "s"}`;
}

function activePrLabel(n: number): string {
  return `${n} active PR${n === 1 ? "" : "s"}`;
}

function buildRowAriaLabel(repo: RepoRowData, reviewerCount: number): string {
  const parts: string[] = [repo.slug, repo.enabled ? "enabled" : "disabled"];
  const cappedSuffix = " (display limit reached)";
  parts.push(
    statusCheckLabel(repo.statusCheckCount) +
      (repo.statusCheckCountIsCapped ? cappedSuffix : ""),
  );
  parts.push(
    fixableLabel(repo.enabledStatusCheckCount) +
      (repo.enabledStatusCheckCountIsCapped ? cappedSuffix : ""),
  );
  parts.push(reviewerLabel(reviewerCount));
  parts.push(
    activePrLabel(repo.activePrCount) +
      (repo.activePrCountIsCapped ? cappedSuffix : ""),
  );
  return parts.join(" — ");
}

/* ──────────────────────────────────────────────────────────────────────────
   Loading + empty states
   ────────────────────────────────────────────────────────────────────── */

function RepoRowSkeleton() {
  return (
    <div
      className="flex items-stretch gap-4 px-4 py-3"
      aria-hidden
      role="presentation"
    >
      <div className="w-1 self-stretch rounded-[2px] bg-surface-panel-hover" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-5 w-56 max-w-full rounded animate-shimmer" />
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-full animate-shimmer" />
          <div className="h-3.5 w-72 max-w-full rounded animate-shimmer" />
        </div>
      </div>
    </div>
  );
}

function PoliciesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <FolderGit2 className="size-5 text-muted-foreground/60" aria-hidden />
      <p className="text-body text-muted-foreground">
        No repositories configured yet.
      </p>
      <p className="text-meta text-muted-foreground/70">
        Repos appear here once discovered by the poller.
      </p>
    </div>
  );
}
