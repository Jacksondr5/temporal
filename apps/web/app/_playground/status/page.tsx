import type { Metadata } from "next";
import { CommitChip } from "../../../components/commit-chip";
import { StatusMark } from "../../../components/status-mark";
import { StatusRail } from "../../../components/status-rail";
import {
  STATUS_KINDS,
  mapDispositionToStatus,
  mapErrorToStatus,
  mapPhaseToStatus,
  mapRunStatusToStatus,
  operatorDispositionLabel,
  operatorPhaseLabel,
  operatorRunStatusLabel,
  type StatusKind,
} from "../../../lib/status";

/**
 * `/_playground/status` — internal sign-off page for the canonical status
 * vocabulary. Renders every `StatusMark` shape, every `StatusRail` motion,
 * the canonical mapping helpers, and the `<CommitChip />` primitive at
 * each of its supported configurations. Not a product surface — kept
 * `noindex` so it never appears in search results.
 *
 * The folder is `_playground/` per the redesign Linear ticket (JAC-181).
 * Heads-up: Next.js 16 treats single-underscore folders as "private
 * folders" and excludes them from routing entirely — verified empirically
 * with `next dev`, where `/_playground/status`, `/%5Fplayground/status`,
 * and `/playground/status` all 404. To actually load this page for
 * design sign-off, rename the folder to `playground/` (or expose it via
 * an explicit re-export at a routable path). The source file is kept at
 * the literal spec path so traceability against the Linear ticket holds.
 */
export const metadata: Metadata = {
  title: "Status playground — internal",
  robots: { index: false, follow: false },
};

const SAMPLE_PHASES = [
  "idle",
  "refreshing",
  "fixing_checks",
  "handling_code_rabbit",
  "running_special_reviewers",
  "resolving_merge_conflicts",
  "recording_results",
  "terminal_cleanup",
  "definitely_a_new_phase_we_have_not_seen", // exercises the fallback path
];

const SAMPLE_RUN_STATUSES = [
  "running",
  "success",
  "failed",
  "blocked",
  "noop",
  "skipped",
];

const SAMPLE_DISPOSITIONS: (string | null)[] = [
  "fix",
  "false_positive",
  "defer",
  null,
];

const SAMPLE_ERRORS: { name: string; blocked: boolean; retryable: boolean }[] =
  [
    { name: "Hard fail (blocked)", blocked: true, retryable: false },
    { name: "Transient (retryable)", blocked: false, retryable: true },
    { name: "Plain error", blocked: false, retryable: false },
  ];

export default function StatusPlaygroundPage() {
  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-[0.08em] text-muted-foreground">
          Internal · noindex · operator-ui-redesign
        </p>
        <h1 className="text-display font-semibold text-foreground">
          Status primitives playground
        </h1>
        <p className="max-w-2xl text-body text-muted-foreground">
          Visual sign-off surface for{" "}
          <code className="font-mono">{`<StatusMark />`}</code>,{" "}
          <code className="font-mono">{`<StatusRail />`}</code>, and{" "}
          <code className="font-mono">{`<CommitChip />`}</code>. Each row
          here mirrors the canonical mapping that{" "}
          <code className="font-mono">apps/web/lib/status.ts</code> exposes
          to the rest of the app — if a state is not represented here,
          consumers should not be inventing it locally.
        </p>
      </header>

      <MarksSection />
      <RailsSection />
      <CommitChipSection />
      <MappingsSection />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function MarksSection() {
  return (
    <Section
      title="StatusMark"
      blurb="One shape + one color per canonical kind. Static — motion lives on the rail, never on the mark itself (Principle 4)."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_KINDS.map((kind) => (
          <div
            key={kind}
            className="flex items-center gap-3 rounded-md border border-border-hairline bg-surface-panel px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <StatusMark status={kind} size="sm" />
              <StatusMark status={kind} size="md" />
            </div>
            <div className="flex flex-col">
              <span className="text-body font-medium capitalize text-foreground">
                {kind}
              </span>
              <span className="text-meta text-muted-foreground">
                <code className="font-mono">{`status="${kind}"`}</code>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function RailsSection() {
  return (
    <Section
      title="StatusRail"
      blurb="4px left rail. Default motion is derived from the kind: live sweeps, caution breathes, everything else stays solid. Override with the motion prop when a row needs a state the kind alone cannot express (e.g. queued/pending → idle + pulse)."
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-micro uppercase tracking-[0.08em] text-muted-foreground">
            Per kind (auto motion)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_KINDS.map((kind) => (
              <RailDemo
                key={kind}
                status={kind}
                label={kind}
                caption={<code className="font-mono">{`motion="auto"`}</code>}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-micro uppercase tracking-[0.08em] text-muted-foreground">
            Motion overrides (idle color, varied motion)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RailDemo
              status="idle"
              label="Solid"
              caption={<code className="font-mono">{`motion="none"`}</code>}
              motion="none"
            />
            <RailDemo
              status="idle"
              label="Pulse (queued)"
              caption={<code className="font-mono">{`motion="pulse"`}</code>}
              motion="pulse"
            />
            <RailDemo
              status="live"
              label="Sweep (running)"
              caption={<code className="font-mono">{`motion="sweep"`}</code>}
              motion="sweep"
            />
            <RailDemo
              status="caution"
              label="Breath (stale)"
              caption={<code className="font-mono">{`motion="breath"`}</code>}
              motion="breath"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function RailDemo({
  status,
  label,
  caption,
  motion,
}: {
  status: StatusKind;
  label: string;
  caption: React.ReactNode;
  motion?: "none" | "pulse" | "sweep" | "breath";
}) {
  return (
    <div className="flex items-stretch gap-3 rounded-md border border-border-hairline bg-surface-panel py-3 pl-2 pr-4">
      <StatusRail status={status} motion={motion} className="h-16 self-stretch" />
      <div className="flex flex-col justify-center gap-0.5">
        <span className="text-body font-medium capitalize text-foreground">
          {label}
        </span>
        <span className="text-meta text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function CommitChipSection() {
  // Sample data shaped like a real `artifacts` row: a SHA the agent
  // produced, a target HEAD it built against, and the change-stats the
  // backend will eventually persist (Issue 1.8).
  const commit = {
    repoSlug: "vercel/next.js",
    sha: "7c2f4e1ad8e90b63a4f1c0f9d4c8b1a3e9c7d6b2",
    targetSha: "a3b8d92f4c1e0a7b6d5c4b3a2e1f0d9c8b7a6e5d",
    message:
      "fix(rsc): replace manual debounce with useDeferredValue per CodeRabbit guidance\n\nThis aligns the streaming RSC implementation with the recommendations in the linked CodeRabbit thread, removing the bespoke debounce hook and letting React handle the deferral natively.",
    stats: { additions: 12, deletions: 4, files: 3 },
  };

  return (
    <Section
      title="CommitChip"
      blurb="First-class commit reference. Same component everywhere — activity stream cards, Inspector outputs panel, anywhere a commit is referenced inline."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChipDemo title="Operator · collapsed (default)">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            message={commit.message}
          />
        </ChipDemo>

        <ChipDemo title="Operator · expanded with stats">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            message={commit.message}
            stats={commit.stats}
            expanded
          />
        </ChipDemo>

        <ChipDemo title="Operator · expanded, no stats">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            message={commit.message}
            expanded
            stats={null}
          />
        </ChipDemo>

        <ChipDemo title="Operator · empty message fallback">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            message=""
          />
        </ChipDemo>

        <ChipDemo title="Inspector · SHA pair (target → observed)">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            targetSha={commit.targetSha}
            message={commit.message}
            mode="inspector"
            expanded
            stats={commit.stats}
          />
        </ChipDemo>

        <ChipDemo title="Inspector · target equals observed (no pair shown)">
          <CommitChip
            repoSlug={commit.repoSlug}
            sha={commit.sha}
            targetSha={commit.sha}
            message={commit.message}
            mode="inspector"
          />
        </ChipDemo>
      </div>
    </Section>
  );
}

function ChipDemo({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-micro uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function MappingsSection() {
  return (
    <Section
      title="Translation tables"
      blurb="Sanity check that every internal enum lands on the right canonical kind and surfaces the correct operator-language label. Inspector mode shows the raw value verbatim — these labels are operator-mode only."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MappingTable
          title="Phase → status"
          rows={SAMPLE_PHASES.map((phase) => ({
            internal: phase,
            kind: mapPhaseToStatus(phase),
            label: operatorPhaseLabel(phase),
          }))}
        />
        <MappingTable
          title="Run status → status"
          rows={SAMPLE_RUN_STATUSES.map((status) => ({
            internal: status,
            kind: mapRunStatusToStatus(status),
            label: operatorRunStatusLabel(status),
          }))}
        />
        <MappingTable
          title="Disposition → status"
          rows={SAMPLE_DISPOSITIONS.map((disposition) => ({
            internal: disposition ?? "(null)",
            kind: mapDispositionToStatus(disposition),
            label: operatorDispositionLabel(disposition),
          }))}
        />
        <MappingTable
          title="Error → status"
          rows={SAMPLE_ERRORS.map((error) => ({
            internal: error.name,
            kind: mapErrorToStatus(error),
            label: error.blocked
              ? "Blocked"
              : error.retryable
                ? "Will retry"
                : "Failed",
          }))}
        />
      </div>
    </Section>
  );
}

function MappingTable({
  title,
  rows,
}: {
  title: string;
  rows: { internal: string; kind: StatusKind; label: string }[];
}) {
  return (
    <div className="rounded-md border border-border-hairline bg-surface-panel">
      <div className="border-b border-border-hairline px-3 py-2">
        <h3 className="text-meta font-medium text-foreground">{title}</h3>
      </div>
      <ul className="divide-y divide-border-hairline">
        {rows.map((row) => (
          <li
            key={row.internal}
            className="flex items-center gap-3 px-3 py-2"
          >
            <StatusMark status={row.kind} size="md" />
            <code className="font-mono text-mono-sm text-muted-foreground">
              {row.internal}
            </code>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="text-body text-foreground">{row.label}</span>
            <span className="ml-auto text-meta uppercase tracking-wider text-muted-foreground">
              {row.kind}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-title font-semibold text-foreground">{title}</h2>
        <p className="max-w-3xl text-meta text-muted-foreground">{blurb}</p>
      </header>
      {children}
    </section>
  );
}
