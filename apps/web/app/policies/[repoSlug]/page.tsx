"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  Plus,
  Save,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "../../../lib/utils";

/**
 * Policy editor — see `docs/product/operator-ui-redesign.md`
 * → "Per-Screen Direction" → "Policy editor".
 *
 * Key shifts from the previous design:
 *
 *   - The Save button moves out of the page header and into a sticky bar
 *     at the bottom of the viewport that only appears while the form is
 *     dirty. The bar shows a one-line summary of what will change so the
 *     operator can see the scope of the diff before committing.
 *   - The Status Checks list is grouped by source (Checks API vs Commit
 *     Status) with a filter chip above the list. Filtering scopes the
 *     visible group; "All" renders both with sub-headers.
 *   - Specialized reviewer cards now follow the layered-detail principle:
 *     ID, run policy, and description sit on the surface, while prompt ID
 *     and file globs are tucked behind a `Configure` expand. Newly added
 *     reviewers default to expanded so the operator can finish wiring them
 *     up immediately.
 */

interface ReviewerDraft {
  /**
   * Stable UI-only key used for React list rendering and tracking which
   * cards are expanded. Not sent to the backend; stripped before save.
   */
  _uiKey: string;
  /**
   * Immutable identity from the server used to reconcile refetches even when
   * the editable reviewer `id` is changed locally.
   */
  serverId: string | null;
  id: string;
  description: string;
  fileGlobs: string;
  runPolicy: "once_per_sha" | "once_per_pr";
  promptId: string;
}

interface StatusCheckSummary {
  name: string;
  source: "check_run" | "commit_status";
  enabled: boolean;
}

interface RepoPolicyDetail {
  repo: Doc<"repos"> | null;
  policy: Doc<"repoPolicies"> | null;
  statusChecks: Array<StatusCheckSummary>;
}

const STATUS_CHECK_SOURCES = ["check_run", "commit_status"] as const;
type StatusCheckSource = (typeof STATUS_CHECK_SOURCES)[number];

const STATUS_CHECK_FILTERS = ["all", ...STATUS_CHECK_SOURCES] as const;
type StatusCheckFilter = (typeof STATUS_CHECK_FILTERS)[number];

const STATUS_CHECK_FILTER_LABELS: Record<StatusCheckFilter, string> = {
  all: "All",
  check_run: "Checks API",
  commit_status: "Commit Status",
};

const STATUS_CHECK_SOURCE_LABELS: Record<StatusCheckSource, string> = {
  check_run: "Checks API",
  commit_status: "Commit Status",
};

export default function PolicyEditPage() {
  const { repoSlug } = useParams<{ repoSlug: string }>();
  const decodedSlug = decodeURIComponent(repoSlug);

  const detail = useQuery(api.ui.getRepoPolicyDetail, {
    repoSlug: decodedSlug,
  });

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-24 rounded animate-shimmer" />
        <div className="h-9 w-72 rounded animate-shimmer" />
        <div className="h-64 w-full rounded-none animate-shimmer" />
      </div>
    );
  }

  return (
    <PolicyEditForm
      key={decodedSlug}
      decodedSlug={decodedSlug}
      detail={detail}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Diff helpers
   ────────────────────────────────────────────────────────────────────── */

interface ReviewerComparable {
  id: string;
  description: string;
  fileGlobs: string;
  runPolicy: "once_per_sha" | "once_per_pr";
  promptId: string;
}

function reviewerComparable(r: ReviewerDraft): ReviewerComparable {
  return {
    id: r.id,
    description: r.description,
    fileGlobs: r.fileGlobs,
    runPolicy: r.runPolicy,
    promptId: r.promptId,
  };
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function computeDirtyParts(args: {
  enabled: boolean;
  initialEnabled: boolean;
  statusCheckSelections: Record<string, boolean>;
  initialStatusCheckSelections: Record<string, boolean>;
  statusCheckNames: readonly string[];
  reviewers: readonly ReviewerDraft[];
  initialReviewers: readonly ReviewerComparable[];
}): string[] {
  const parts: string[] = [];

  if (args.enabled !== args.initialEnabled) {
    parts.push(args.enabled ? "Polling enabled" : "Polling disabled");
  }

  let checkChanges = 0;
  for (const name of args.statusCheckNames) {
    const before = args.initialStatusCheckSelections[name] ?? false;
    const after = args.statusCheckSelections[name] ?? false;
    if (before !== after) checkChanges += 1;
  }
  if (checkChanges > 0) {
    parts.push(pluralize(checkChanges, "status check change"));
  }

  const currentComparable = args.reviewers.map(reviewerComparable);
  if (
    JSON.stringify(currentComparable) !== JSON.stringify(args.initialReviewers)
  ) {
    const lenDiff = currentComparable.length - args.initialReviewers.length;
    if (lenDiff > 0) parts.push(pluralize(lenDiff, "reviewer added"));
    else if (lenDiff < 0) parts.push(pluralize(-lenDiff, "reviewer removed"));

    const minLen = Math.min(
      currentComparable.length,
      args.initialReviewers.length,
    );
    let modified = 0;
    for (let i = 0; i < minLen; i++) {
      if (
        JSON.stringify(currentComparable[i]) !==
        JSON.stringify(args.initialReviewers[i])
      ) {
        modified += 1;
      }
    }
    if (modified > 0) parts.push(pluralize(modified, "reviewer modified"));
  }

  return parts;
}

/* ──────────────────────────────────────────────────────────────────────────
   <PolicyEditForm />
   ────────────────────────────────────────────────────────────────────── */

function PolicyEditForm({
  decodedSlug,
  detail,
}: {
  decodedSlug: string;
  detail: RepoPolicyDetail;
}) {
  const upsertRepo = useMutation(api.repos.upsert);
  const upsertPolicy = useMutation(api.repoPolicies.upsert);
  const setStatusCheckEnabled = useMutation(api.repoStatusChecks.setEnabled);

  // The "initial" reference values are derived from `detail`, the current
  // server-side truth. Comparing local state against `detail` means a
  // successful save naturally clears the dirty state when the Convex query
  // refetches, without bookkeeping.
  const initialEnabled = detail.repo?.enabled ?? true;
  const initialStatusCheckSelections = useMemo(
    () =>
      Object.fromEntries(
        detail.statusChecks.map((check) => [check.name, check.enabled]),
      ),
    [detail.statusChecks],
  );
  const initialReviewers = useMemo(
    () =>
      (detail.policy?.specializedReviewers ?? []).map(
        (r): ReviewerComparable => ({
          id: r.id,
          description: r.description,
          fileGlobs: r.fileGlobs.join(", "),
          runPolicy: r.runPolicy,
          promptId: r.promptId,
        }),
      ),
    [detail.policy],
  );

  const [enabled, setEnabled] = useState(() => initialEnabled);
  const [statusCheckSelections, setStatusCheckSelections] = useState<
    Record<string, boolean>
  >(() => ({ ...initialStatusCheckSelections }));
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>(() =>
    initialReviewers.map((r, i) => ({
      _uiKey: `existing-${i}`,
      serverId: r.id,
      ...r,
    })),
  );
  const [statusCheckFilter, setStatusCheckFilter] =
    useState<StatusCheckFilter>("all");
  const [expandedReviewerKeys, setExpandedReviewerKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const previousInitialReviewersRef = useRef(initialReviewers);

  const statusCheckNames = useMemo(
    () => detail.statusChecks.map((c) => c.name),
    [detail.statusChecks],
  );

  const dirtyParts = useMemo(
    () =>
      computeDirtyParts({
        enabled,
        initialEnabled,
        statusCheckSelections,
        initialStatusCheckSelections,
        statusCheckNames,
        reviewers,
        initialReviewers,
      }),
    [
      enabled,
      initialEnabled,
      statusCheckSelections,
      initialStatusCheckSelections,
      statusCheckNames,
      reviewers,
      initialReviewers,
    ],
  );
  const isDirty = dirtyParts.length > 0;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      setStatusCheckSelections((prev) => {
        const next: Record<string, boolean> = {};
        for (const [name, initialValue] of Object.entries(
          initialStatusCheckSelections,
        )) {
          next[name] = name in prev ? prev[name] : initialValue;
        }
        return next;
      });

      const previousInitialByServerId = new Map(
        previousInitialReviewersRef.current.map((reviewer) => [
          reviewer.id,
          reviewer,
        ]),
      );
      const nextInitialByServerId = new Map(
        initialReviewers.map((reviewer) => [reviewer.id, reviewer]),
      );

      setReviewers((prev) => {
        const prevByServerId = new Map(
          prev
            .filter((reviewer) => reviewer.serverId !== null)
            .map((reviewer) => [reviewer.serverId, reviewer]),
        );
        const reconciled = initialReviewers.map((initialReviewer) => {
          const existing = prevByServerId.get(initialReviewer.id);
          if (!existing) {
            return {
              _uiKey: `existing-${initialReviewer.id || crypto.randomUUID()}`,
              serverId: initialReviewer.id,
              ...initialReviewer,
            };
          }

          const previousInitial = previousInitialByServerId.get(
            initialReviewer.id,
          );
          const existingComparable: ReviewerComparable = {
            id: existing.id,
            description: existing.description,
            fileGlobs: existing.fileGlobs,
            runPolicy: existing.runPolicy,
            promptId: existing.promptId,
          };
          const wasEdited =
            previousInitial !== undefined &&
            JSON.stringify(existingComparable) !==
              JSON.stringify(previousInitial);

          if (wasEdited) return existing;
          return {
            ...existing,
            ...initialReviewer,
            serverId: initialReviewer.id,
          };
        });

        const localOnly = prev.filter(
          (reviewer) =>
            reviewer.serverId === null &&
            !nextInitialByServerId.has(reviewer.id),
        );

        return [...reconciled, ...localOnly];
      });

      previousInitialReviewersRef.current = initialReviewers;
    });
    return () => {
      cancelled = true;
    };
  }, [initialReviewers, initialStatusCheckSelections]);

  /* ── reviewer mutators ── */

  const addReviewer = useCallback(() => {
    setReviewers((prev) => {
      const newKey = `new-${Date.now()}-${prev.length}`;
      // Newly added reviewers default to expanded so the operator can
      // immediately fill in the prompt ID and globs (the layered-detail
      // fields). Existing reviewers stay collapsed by default.
      setExpandedReviewerKeys((expanded) => {
        const next = new Set(expanded);
        next.add(newKey);
        return next;
      });
      return [
        ...prev,
        {
          _uiKey: newKey,
          serverId: null,
          id: "",
          description: "",
          fileGlobs: "",
          runPolicy: "once_per_sha",
          promptId: "",
        },
      ];
    });
  }, []);

  const removeReviewer = useCallback((index: number) => {
    setReviewers((prev) => {
      const removed = prev[index];
      if (removed) {
        setExpandedReviewerKeys((expanded) => {
          if (!expanded.has(removed._uiKey)) return expanded;
          const next = new Set(expanded);
          next.delete(removed._uiKey);
          return next;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateReviewer = useCallback(
    (index: number, field: keyof ReviewerComparable, value: string) => {
      setReviewers((prev) =>
        prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );

  const toggleReviewerExpanded = useCallback((uiKey: string) => {
    setExpandedReviewerKeys((expanded) => {
      const next = new Set(expanded);
      if (next.has(uiKey)) next.delete(uiKey);
      else next.add(uiKey);
      return next;
    });
  }, []);

  /* ── discard / save ── */

  const handleDiscard = useCallback(() => {
    setEnabled(initialEnabled);
    setStatusCheckSelections({ ...initialStatusCheckSelections });
    setReviewers(
      initialReviewers.map((r, i) => ({
        _uiKey: `existing-${i}`,
        serverId: r.id,
        ...r,
      })),
    );
    setExpandedReviewerKeys(new Set());
    setSaveStatus("idle");
  }, [initialEnabled, initialStatusCheckSelections, initialReviewers]);

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const parsedReviewers = reviewers.map((r) => ({
        id: r.id,
        description: r.description,
        fileGlobs: r.fileGlobs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        runPolicy: r.runPolicy,
        promptId: r.promptId,
      }));

      const [owner, name] = decodedSlug.includes("/")
        ? decodedSlug.split("/", 2)
        : ["", decodedSlug];

      await upsertRepo({
        slug: decodedSlug,
        owner: owner || detail.repo?.owner || "",
        name: name || detail.repo?.name || "",
        enabled,
      });

      await upsertPolicy({
        repoSlug: decodedSlug,
        specializedReviewers: parsedReviewers,
      });

      await Promise.all(
        detail.statusChecks
          .filter(
            (check) =>
              (statusCheckSelections[check.name] ?? false) !== check.enabled,
          )
          .map((check) =>
            setStatusCheckEnabled({
              repoSlug: decodedSlug,
              name: check.name,
              enabled: statusCheckSelections[check.name] ?? false,
            }),
          ),
      );

      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save policy:", err);
      setSaveStatus("error");
      window.setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  /* ── status check filtering / grouping ── */

  const groupedStatusChecks = useMemo(() => {
    const groups: Record<StatusCheckSource, StatusCheckSummary[]> = {
      check_run: [],
      commit_status: [],
    };
    for (const check of detail.statusChecks) {
      groups[check.source].push(check);
    }
    return groups;
  }, [detail.statusChecks]);

  const statusCheckCounts = useMemo<Record<StatusCheckFilter, number>>(
    () => ({
      all: detail.statusChecks.length,
      check_run: groupedStatusChecks.check_run.length,
      commit_status: groupedStatusChecks.commit_status.length,
    }),
    [detail.statusChecks, groupedStatusChecks],
  );

  const visibleSources = useMemo<StatusCheckSource[]>(() => {
    if (statusCheckFilter === "all") return [...STATUS_CHECK_SOURCES];
    return [statusCheckFilter];
  }, [statusCheckFilter]);

  return (
    <div className="space-y-6 pb-24">
      {/* Header — Save button is gone; the sticky bar handles save. */}
      <div>
        <Link
          href="/policies"
          className="mb-3 inline-flex items-center gap-2 text-meta text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Policies
        </Link>
        <h1 className="text-display font-semibold tracking-tight text-foreground">
          {decodedSlug}
        </h1>
        <p className="mt-1 text-meta text-muted-foreground">
          Configure check handling and specialized reviewers.
        </p>
      </div>

      {/* Repository enabled toggle */}
      <Section title="Repository">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-body text-foreground">Enable polling</p>
            <p className="mt-0.5 text-meta text-muted-foreground">
              When disabled, the poller skips this repository.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable polling for this repository"
          />
        </div>
      </Section>

      {/* Check classifications */}
      <Section title="Status Checks">
        <div className="space-y-4">
          <StatusCheckFilterBar
            active={statusCheckFilter}
            counts={statusCheckCounts}
            onChange={setStatusCheckFilter}
          />

          {detail.statusChecks.length === 0 ? (
            <StatusChecksEmptyState />
          ) : (
            <div className="space-y-5">
              {visibleSources.map((source) => {
                const checks = groupedStatusChecks[source];
                return (
                  <StatusCheckGroup
                    key={source}
                    source={source}
                    showHeader={statusCheckFilter === "all"}
                    checks={checks}
                    selections={statusCheckSelections}
                    onToggle={(name, value) =>
                      setStatusCheckSelections((prev) => ({
                        ...prev,
                        [name]: value,
                      }))
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* Specialized reviewers */}
      <Section
        title="Specialized Reviewers"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={addReviewer}
            className="gap-1.5 border-border-hairline text-meta hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            <Plus className="size-3.5" /> Add reviewer
          </Button>
        }
      >
        {reviewers.length === 0 ? (
          <ReviewersEmptyState />
        ) : (
          <div className="space-y-3">
            {reviewers.map((reviewer, index) => (
              <ReviewerCard
                key={reviewer._uiKey}
                index={index}
                reviewer={reviewer}
                expanded={expandedReviewerKeys.has(reviewer._uiKey)}
                onToggleExpanded={() => toggleReviewerExpanded(reviewer._uiKey)}
                onChange={(field, value) => updateReviewer(index, field, value)}
                onRemove={() => removeReviewer(index)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Sticky save bar — appears only while the form is dirty. */}
      <SaveBar
        visible={isDirty}
        summary={dirtyParts.join(" · ")}
        saveStatus={saveStatus}
        onDiscard={handleDiscard}
        onSave={handleSave}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Status check filter + grouping
   ────────────────────────────────────────────────────────────────────── */

function StatusCheckFilterBar({
  active,
  counts,
  onChange,
}: {
  active: StatusCheckFilter;
  counts: Record<StatusCheckFilter, number>;
  onChange: (filter: StatusCheckFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter status checks by source"
      className="flex flex-wrap items-center gap-1.5"
    >
      {STATUS_CHECK_FILTERS.map((filter) => {
        const isActive = filter === active;
        return (
          <button
            type="button"
            key={filter}
            aria-pressed={isActive}
            onClick={() => onChange(filter)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-meta font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "border-transparent bg-foreground text-surface-canvas"
                : "border-border-hairline bg-surface-panel text-muted-foreground hover:bg-surface-panel-hover hover:text-foreground",
            )}
          >
            <span>{STATUS_CHECK_FILTER_LABELS[filter]}</span>
            <span
              className={cn(
                "tabular-nums text-mono-sm",
                isActive
                  ? "text-surface-canvas/70"
                  : "text-muted-foreground/70",
              )}
            >
              {counts[filter]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusCheckGroup({
  source,
  showHeader,
  checks,
  selections,
  onToggle,
}: {
  source: StatusCheckSource;
  showHeader: boolean;
  checks: readonly StatusCheckSummary[];
  selections: Record<string, boolean>;
  onToggle: (name: string, value: boolean) => void;
}) {
  if (checks.length === 0) {
    return (
      <div className="space-y-2">
        {showHeader && (
          <GroupHeader label={STATUS_CHECK_SOURCE_LABELS[source]} />
        )}
        <p className="text-meta text-muted-foreground">
          No checks of this type yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showHeader && <GroupHeader label={STATUS_CHECK_SOURCE_LABELS[source]} />}
      <div className="divide-y divide-border-hairline overflow-hidden rounded-md border border-border-hairline">
        {checks.map((check) => {
          const checked = selections[check.name] ?? false;
          return (
            <label
              key={check.name}
              className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-panel-hover"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(nextChecked) =>
                  onToggle(check.name, nextChecked === true)
                }
                aria-label={`Mark ${check.name} as fixable`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-mono text-mono-sm text-foreground">
                  {check.name}
                </div>
              </div>
              {checked && (
                <span className="shrink-0 text-micro font-semibold uppercase tracking-[0.08em] text-status-healthy">
                  Fixable
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </div>
  );
}

function StatusChecksEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <CheckCircle className="size-5 text-muted-foreground/40" aria-hidden />
      <p className="text-body text-muted-foreground">
        No status checks discovered yet.
      </p>
      <p className="text-meta text-muted-foreground/70">
        The poller adds checks here after observing open pull requests.
      </p>
    </div>
  );
}

function ReviewersEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Settings className="size-5 text-muted-foreground/40" aria-hidden />
      <p className="text-body text-muted-foreground">
        No specialized reviewers configured.
      </p>
      <p className="text-meta text-muted-foreground/70">
        Add a reviewer to run targeted analysis on matching files.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Reviewer card — surface (ID / run policy / description) + Configure
   expand (prompt ID / file globs).
   ────────────────────────────────────────────────────────────────────── */

function ReviewerCard({
  index,
  reviewer,
  expanded,
  onToggleExpanded,
  onChange,
  onRemove,
}: {
  index: number;
  reviewer: ReviewerDraft;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (field: keyof ReviewerComparable, value: string) => void;
  onRemove: () => void;
}) {
  const detailsId = useId();
  const headingId = useId();
  const idInputId = useId();
  const runPolicyInputId = useId();
  const descriptionInputId = useId();
  const promptIdInputId = useId();
  const fileGlobsInputId = useId();

  return (
    <div
      aria-labelledby={headingId}
      className="rounded-md border border-border-hairline bg-surface-inset/40 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          id={headingId}
          className="text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Reviewer #{index + 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove reviewer #${index + 1}`}
          className="size-7 p-0 text-status-blocked/80 hover:bg-status-blocked/10 hover:text-status-blocked"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Surface fields: ID, run policy, description. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldGroup label="ID" htmlFor={idInputId}>
          <Input
            id={idInputId}
            value={reviewer.id}
            onChange={(e) => onChange("id", e.target.value)}
            placeholder="security-reviewer"
            className="border-border-hairline bg-surface-panel font-mono text-mono-sm"
          />
        </FieldGroup>
        <FieldGroup label="Run policy" htmlFor={runPolicyInputId}>
          <select
            id={runPolicyInputId}
            value={reviewer.runPolicy}
            onChange={(e) => onChange("runPolicy", e.target.value)}
            className="flex h-9 w-full rounded-md border border-border-hairline bg-surface-panel px-3 py-1 text-body text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          >
            <option value="once_per_sha">Once per SHA</option>
            <option value="once_per_pr">Once per PR</option>
          </select>
        </FieldGroup>
      </div>

      <div className="mt-3">
        <FieldGroup label="Description" htmlFor={descriptionInputId}>
          <Input
            id={descriptionInputId}
            value={reviewer.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="Reviews security-sensitive files"
            className="border-border-hairline bg-surface-panel text-body"
          />
        </FieldGroup>
      </div>

      {/* Configure expand: prompt ID + file globs. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-meta text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
          <span>{expanded ? "Hide configuration" : "Configure"}</span>
        </button>

        {expanded && (
          <div
            id={detailsId}
            className="mt-3 space-y-3 border-t border-border-hairline pt-3"
          >
            <FieldGroup label="Prompt ID" htmlFor={promptIdInputId}>
              <Input
                id={promptIdInputId}
                value={reviewer.promptId}
                onChange={(e) => onChange("promptId", e.target.value)}
                placeholder="security-review-v1"
                className="border-border-hairline bg-surface-panel font-mono text-mono-sm"
              />
            </FieldGroup>
            <FieldGroup
              label="File globs"
              htmlFor={fileGlobsInputId}
              description="Comma-separated glob patterns"
            >
              <Input
                id={fileGlobsInputId}
                value={reviewer.fileGlobs}
                onChange={(e) => onChange("fileGlobs", e.target.value)}
                placeholder="src/auth/**, *.security.ts"
                className="border-border-hairline bg-surface-panel font-mono text-mono-sm"
              />
            </FieldGroup>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sticky save bar
   ────────────────────────────────────────────────────────────────────── */

function SaveBar({
  visible,
  summary,
  saveStatus,
  onDiscard,
  onSave,
}: {
  visible: boolean;
  summary: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (!visible && saveStatus === "idle") return null;

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border-strong bg-surface-panel/95 transition-transform",
        visible || saveStatus !== "idle" ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
        <div
          role="status"
          aria-live={saveStatus === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <SaveBarSummary summary={summary} saveStatus={saveStatus} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={saveStatus === "saving"}
            className="border-border-hairline text-meta"
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={saveStatus === "saving" || !visible}
            className="gap-1.5 bg-primary text-meta text-primary-foreground hover:bg-primary/90"
          >
            <Save className="size-3.5" aria-hidden />
            <span>{saveStatus === "saving" ? "Saving…" : "Save"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveBarSummary({
  summary,
  saveStatus,
}: {
  summary: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
}) {
  if (saveStatus === "saved") {
    return (
      <span className="inline-flex items-center gap-2 text-meta text-status-healthy">
        <CheckCircle className="size-3.5" aria-hidden /> Saved
      </span>
    );
  }
  if (saveStatus === "error") {
    return (
      <span className="inline-flex items-center gap-2 text-meta text-status-blocked">
        <AlertCircle className="size-3.5" aria-hidden /> Save failed — try again
      </span>
    );
  }
  return (
    <span className="text-meta text-muted-foreground tabular-nums">
      {summary || "Unsaved changes"}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Section + FieldGroup — restyled onto the new tokens.
   ────────────────────────────────────────────────────────────────────── */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-none border border-border-hairline bg-surface-panel">
      <div className="flex items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
        <h2 className="text-title font-medium text-foreground">{title}</h2>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function FieldGroup({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-meta text-foreground/80">
        {label}
      </Label>
      {description && (
        <p className="text-meta text-muted-foreground/80">{description}</p>
      )}
      {children}
    </div>
  );
}
