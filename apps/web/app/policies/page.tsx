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
 * Policies list in the Machine Room rack language.
 * Enabled repositories are station rows with a canonical status rail and
 * mark. Disabled repositories sort lower and render with reduced emphasis.
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
          <h1 className="font-chrome text-display font-semibold tracking-[0.005em] text-foreground">
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
  const status = repo.enabled ? "healthy" : "skipped";
  const reviewerCount = repo.policy?.specializedReviewers.length ?? 0;

  const ariaLabel = buildRowAriaLabel(repo, reviewerCount);

  return (
    <Link
      href={`/policies/${encodeURIComponent(repo.slug)}`}
      aria-label={ariaLabel}
      className={cn(
        "group relative grid min-h-24 grid-cols-[4px_64px_minmax(0,1fr)] items-stretch transition-colors",
        "hover:bg-surface-panel-hover md:grid-cols-[4px_64px_minmax(0,1fr)_minmax(320px,420px)]",
        !repo.enabled && "opacity-55",
      )}
    >
      <StatusRail status={status} className="self-stretch" />

      <div className="flex items-center justify-center border-r border-border-hairline bg-surface-charcoal-up">
        <StatusMark status={status} size="md" label={null} />
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-2 px-4 py-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="min-w-0 truncate font-chrome text-[20px] font-semibold leading-tight text-foreground"
            title={repo.slug}
          >
            {repo.slug}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-chrome text-[11px] font-bold uppercase tracking-[0.18em]",
              repo.enabled ? "text-status-healthy" : "text-status-skipped",
            )}
          >
            {repo.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-foreground">
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

      <div className="col-span-3 border-t border-border-hairline bg-surface-charcoal-up px-4 py-3 pr-10 md:col-span-1 md:border-l md:border-t-0">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
          <TelemetryCell
            label="Checks"
            value={repo.statusCheckCount}
            capped={repo.statusCheckCountIsCapped}
          />
          <TelemetryCell
            label="Fixable"
            value={repo.enabledStatusCheckCount}
            capped={repo.enabledStatusCheckCountIsCapped}
          />
          <TelemetryCell label="Reviewers" value={reviewerCount} />
          <TelemetryCell
            label="Active PRs"
            value={repo.activePrCount}
            capped={repo.activePrCountIsCapped}
          />
        </dl>
      </div>

      <ChevronRight
        className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40 transition-colors group-hover:text-primary"
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

function TelemetryCell({
  label,
  value,
  capped = false,
}: {
  label: string;
  value: number;
  capped?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        title={capped ? CAPPED_TOOLTIP : undefined}
        className={cn(
          "mt-1 font-mono text-mono-sm tabular-nums text-foreground",
          capped &&
            "cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-[3px]",
        )}
      >
        {value}
        {capped ? "+" : ""}
      </dd>
    </div>
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
      className="grid min-h-24 grid-cols-[4px_64px_minmax(0,1fr)] items-stretch md:grid-cols-[4px_64px_minmax(0,1fr)_minmax(320px,420px)]"
      aria-hidden
      role="presentation"
    >
      <div className="w-1 self-stretch bg-surface-panel-hover" />
      <div className="flex items-center justify-center border-r border-border-hairline bg-surface-charcoal-up">
        <div className="size-3 animate-shimmer" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-4">
        <div className="h-5 w-56 max-w-full animate-shimmer" />
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-72 max-w-full animate-shimmer" />
        </div>
      </div>
      <div className="hidden border-l border-border-hairline bg-surface-charcoal-up px-4 py-3 md:block">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 animate-shimmer" />
          <div className="h-8 animate-shimmer" />
          <div className="h-8 animate-shimmer" />
          <div className="h-8 animate-shimmer" />
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
