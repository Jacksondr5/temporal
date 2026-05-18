"use client";

import { ArrowUpRight, MessageSquare, Package, Ticket } from "lucide-react";
import { CommitChip } from "./commit-chip";
import { TimeAgo } from "./time-ago";
import { cn } from "../lib/utils";

/**
 * `<OutputsPanel />` — Inspector-only summary of every artifact the
 * orchestrator has produced for a PR, grouped by `artifactKind`.
 *
 * Implements `docs/product/operator-ui-redesign.md` →
 * "Component Patterns" → "Outputs panel (Inspector only)":
 *
 * > "Inspector mode includes a compact 'Outputs' panel that lists
 * > artifacts by kind, since the artifact set is small and well-defined.
 * > […]
 * > The Outputs panel groups by kind. Commits render as full commit chips
 * > so the visual language matches the activity stream. GitHub comments
 * > and Linear issues render as compact rows with `externalId`, `summary`,
 * > and `createdAt`. […] Operator mode does not need this panel —
 * > artifacts are already attached to their parent events in the stream,
 * > and commits in particular are surfaced via the commit chip."
 *
 * Layout:
 *
 *   ┌─ Outputs ─────────────────────────────────────────────────────┐
 *   │                                                               │
 *   │  Commits (2)                                                  │
 *   │  ┌──────────────────────────────────────────────────────┐     │
 *   │  │ ⎇ Pushed commit 7c2f4e1 ↗                            │     │
 *   │  │   fix(rsc): replace manual debounce with useDeferred │     │
 *   │  └──────────────────────────────────────────────────────┘     │
 *   │                                                               │
 *   │  GitHub comments (1)                                          │
 *   │  ┌──────────────────────────────────────────────────────┐     │
 *   │  │ 💬 IC_1234567890           ↗                         │     │
 *   │  │    This is actually correct behavior · 2m ago        │     │
 *   │  └──────────────────────────────────────────────────────┘     │
 *   │                                                               │
 *   │  Linear issues (1)                                            │
 *   │  ┌──────────────────────────────────────────────────────┐     │
 *   │  │ 🎟 JAC-191                  ↗                        │     │
 *   │  │    Track this for follow-up · 5m ago                 │     │
 *   │  └──────────────────────────────────────────────────────┘     │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Empty kinds are not rendered (per the redesign doc: "easy to verify at
 * a glance that 'every deferred thread has a Linear ticket' or 'the agent
 * pushed exactly one commit this run' without scrubbing the timeline" —
 * which only reads cleanly when the panel only shows kinds that actually
 * occurred). When no artifacts of any kind exist, the panel collapses to
 * a quiet "no outputs yet" empty state instead of a stack of empty
 * sub-headers.
 *
 * Commit chips reuse `<CommitChip mode="inspector">` so the visual
 * language for "the agent pushed a commit" stays identical between the
 * activity stream and the Outputs panel — Principle 11 in the design doc.
 */

/**
 * Subset of an `artifacts` row this panel reads. Defined structurally so
 * the parent can pass either the full Convex doc or a slimmed-down
 * pre-projection without an explicit cast.
 */
export interface OutputsPanelArtifact {
  _id: string;
  artifactKind: string;
  externalId: string;
  summary: string | null;
  commitMessage?: string | null;
  commitStats?: {
    additions: number;
    deletions: number;
    files: number;
  } | null;
  createdAt: string;
}

export interface OutputsPanelProps {
  repoSlug: string;
  prNumber: number;
  artifacts: readonly OutputsPanelArtifact[];
  className?: string;
}

export function OutputsPanel({
  repoSlug,
  prNumber,
  artifacts,
  className,
}: OutputsPanelProps) {
  // The artifact set is small (<100 items in `getPullRequestDetail`'s
  // server-side cap), so a single-pass partition is cheaper than three
  // independent `.filter()` walks and lets the React Compiler reuse the
  // grouped buckets across renders.
  const { commits, githubComments, linearIssues, others } =
    groupArtifactsByKind(artifacts);

  const totalKnown =
    commits.length + githubComments.length + linearIssues.length;
  const hasAny = totalKnown > 0 || others.length > 0;

  return (
    <section
      aria-label="Outputs"
      className={cn(
        "border border-border-strong bg-surface-inspector-panel",
        className,
      )}
      data-mode="inspector"
    >
      <PanelHeader count={totalKnown + others.length} />

      {!hasAny ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border-hairline p-px xl:grid-cols-3">
          {commits.length > 0 && (
            <CommitGroup repoSlug={repoSlug} artifacts={commits} />
          )}
          {githubComments.length > 0 && (
            <GithubCommentGroup
              repoSlug={repoSlug}
              prNumber={prNumber}
              artifacts={githubComments}
            />
          )}
          {linearIssues.length > 0 && (
            <LinearIssueGroup artifacts={linearIssues} />
          )}
          {/*
            Defensive fallback. The orchestrator currently emits exactly the
            three kinds above (per `docs/product/operator-ui-redesign.md` →
            "Outputs panel"), but a future kind shipped before this panel
            learns to render it would otherwise vanish from the Inspector.
            Group label echoes the raw `artifactKind` so the gap is obvious.
          */}
          {others.length > 0 && <UnknownKindGroup artifacts={others} />}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Header / empty state
   ────────────────────────────────────────────────────────────────────── */

function PanelHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-hairline bg-surface-charcoal-deep px-3 py-2">
      <Package className="h-4 w-4 text-status-caution" aria-hidden />
      <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-status-caution">
        Technical Output Rack
      </h2>
      <span className="font-mono text-micro tabular-nums text-muted-foreground">
        ({count})
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="m-3 flex flex-col items-center justify-center border border-border/60 bg-surface-inspector py-10 font-sans text-muted-foreground">
      <Package className="h-7 w-7 mb-3 opacity-30" aria-hidden />
      <p className="text-sm">No outputs produced yet.</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Group: commits
   ────────────────────────────────────────────────────────────────────── */

function CommitGroup({
  repoSlug,
  artifacts,
}: {
  repoSlug: string;
  artifacts: readonly OutputsPanelArtifact[];
}) {
  return (
    <GroupShell label="Commits" count={artifacts.length}>
      <ul className="space-y-2" role="list">
        {artifacts.map((artifact) => (
          <li key={artifact._id}>
            <CommitChip
              mode="inspector"
              repoSlug={repoSlug}
              sha={artifact.externalId}
              // The commit message is the canonical chip subtitle; fall
              // back to the artifact summary if the orchestrator did not
              // persist a dedicated commit message (Gap 3 in the doc).
              message={artifact.commitMessage ?? artifact.summary ?? ""}
              stats={artifact.commitStats ?? null}
            />
          </li>
        ))}
      </ul>
    </GroupShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Group: GitHub comments
   ────────────────────────────────────────────────────────────────────── */

function GithubCommentGroup({
  repoSlug,
  prNumber,
  artifacts,
}: {
  repoSlug: string;
  prNumber: number;
  artifacts: readonly OutputsPanelArtifact[];
}) {
  return (
    <GroupShell label="GitHub comments" count={artifacts.length}>
      <ul className="space-y-1.5" role="list">
        {artifacts.map((artifact) => (
          <li key={artifact._id}>
            <ArtifactRow
              icon={MessageSquare}
              externalId={artifact.externalId}
              externalIdClassName="text-foreground/85"
              summary={artifact.summary}
              createdAt={artifact.createdAt}
              href={githubCommentUrl(repoSlug, prNumber, artifact.externalId)}
              ariaLabel={`Open GitHub comment ${artifact.externalId}`}
            />
          </li>
        ))}
      </ul>
    </GroupShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Group: Linear issues
   ────────────────────────────────────────────────────────────────────── */

function LinearIssueGroup({
  artifacts,
}: {
  artifacts: readonly OutputsPanelArtifact[];
}) {
  return (
    <GroupShell label="Linear issues" count={artifacts.length}>
      <ul className="space-y-1.5" role="list">
        {artifacts.map((artifact) => (
          <li key={artifact._id}>
            <ArtifactRow
              icon={Ticket}
              iconClassName="text-status-deferred"
              externalId={artifact.externalId}
              externalIdClassName="text-status-deferred"
              summary={artifact.summary}
              createdAt={artifact.createdAt}
              href={linearIssueUrl(artifact.externalId)}
              ariaLabel={`Open Linear issue ${artifact.externalId}`}
            />
          </li>
        ))}
      </ul>
    </GroupShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Group: unknown kinds (defensive)
   ────────────────────────────────────────────────────────────────────── */

function UnknownKindGroup({
  artifacts,
}: {
  artifacts: readonly OutputsPanelArtifact[];
}) {
  // Bucket once more so each unknown kind gets its own labelled sub-group.
  // Using a Map preserves the insertion order of `artifacts`, which is
  // already `createdAt desc` from `getPullRequestDetail`.
  const byKind = new Map<string, OutputsPanelArtifact[]>();
  for (const artifact of artifacts) {
    const bucket = byKind.get(artifact.artifactKind) ?? [];
    bucket.push(artifact);
    byKind.set(artifact.artifactKind, bucket);
  }

  return (
    <>
      {Array.from(byKind.entries()).map(([kind, bucket]) => (
        <GroupShell key={kind} label={kind} count={bucket.length}>
          <ul className="space-y-1.5" role="list">
            {bucket.map((artifact) => (
              <li key={artifact._id}>
                <ArtifactRow
                  externalId={artifact.externalId}
                  summary={artifact.summary}
                  createdAt={artifact.createdAt}
                />
              </li>
            ))}
          </ul>
        </GroupShell>
      ))}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Shared sub-components
   ────────────────────────────────────────────────────────────────────── */

function GroupShell({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface-inspector p-3">
      <div className="mb-2 flex items-center gap-2 border-b border-border-hairline pb-2">
        <h3 className="font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </h3>
        <span className="font-mono text-micro tabular-nums text-muted-foreground">
          ({count})
        </span>
      </div>
      {children}
    </div>
  );
}

interface ArtifactRowProps {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName?: string;
  externalId: string;
  externalIdClassName?: string;
  summary: string | null;
  createdAt: string;
  /** When supplied, the row's external-link arrow becomes a real anchor. */
  href?: string;
  ariaLabel?: string;
}

/**
 * Compact `github_comment` / `linear_issue` row. The deep-link target is
 * the trailing `↗` icon — matching the affordance used by `<CommitChip />`
 * so the same visual cue ("this opens externally") reads identically
 * across every output kind.
 */
function ArtifactRow({
  icon: Icon,
  iconClassName,
  externalId,
  externalIdClassName,
  summary,
  createdAt,
  href,
  ariaLabel,
}: ArtifactRowProps) {
  const trimmedSummary = summary?.trim() ?? "";
  const hasSummary = trimmedSummary.length > 0;

  return (
    <div className="flex items-start gap-2 border border-border/60 bg-surface-inspector-panel px-3 py-2">
      {Icon && (
        <Icon
          className={cn(
            "h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground",
            iconClassName,
          )}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <code
            className={cn(
              "font-mono text-[12px] tabular-nums text-foreground/85 truncate",
              externalIdClassName,
            )}
            title={externalId}
          >
            {externalId}
          </code>
          <TimeAgo date={createdAt} className="text-[11px]" />
        </div>
        {hasSummary && (
          <p className="text-[12px] font-sans leading-relaxed text-foreground/75">
            {trimmedSummary}
          </p>
        )}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center border border-transparent text-muted-foreground transition hover:border-border-strong hover:text-foreground"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

interface GroupedArtifacts {
  commits: OutputsPanelArtifact[];
  githubComments: OutputsPanelArtifact[];
  linearIssues: OutputsPanelArtifact[];
  others: OutputsPanelArtifact[];
}

function groupArtifactsByKind(
  artifacts: readonly OutputsPanelArtifact[],
): GroupedArtifacts {
  const commits: OutputsPanelArtifact[] = [];
  const githubComments: OutputsPanelArtifact[] = [];
  const linearIssues: OutputsPanelArtifact[] = [];
  const others: OutputsPanelArtifact[] = [];

  for (const artifact of artifacts) {
    switch (artifact.artifactKind) {
      case "commit":
        commits.push(artifact);
        break;
      case "github_comment":
        githubComments.push(artifact);
        break;
      case "linear_issue":
        linearIssues.push(artifact);
        break;
      default:
        others.push(artifact);
        break;
    }
  }

  return { commits, githubComments, linearIssues, others };
}

/**
 * Build the deep link for a CodeRabbit-produced PR review comment. The
 * orchestrator stores `externalId` as the GitHub review-comment id (per
 * `apps/orchestrator/src/activities/persistCodeRabbitExecution.ts`), and
 * GitHub's stable in-page anchor for review comments is
 * `#discussion_r<commentId>` on the PR's URL.
 */
function githubCommentUrl(
  repoSlug: string,
  prNumber: number,
  externalId: string,
): string {
  return `https://github.com/${repoSlug}/pull/${prNumber}#discussion_r${externalId}`;
}

/**
 * Build the deep link for a Linear issue. The artifact's `externalId` is
 * the human Linear identifier (e.g. `JAC-191`); Linear redirects the
 * workspace-less `/issue/<id>` URL to the issue's canonical workspace
 * URL when the viewer is signed in to a workspace that owns the id.
 */
function linearIssueUrl(externalId: string): string {
  return `https://linear.app/issue/${externalId}`;
}
