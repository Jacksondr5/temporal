import type { Metadata } from "next";
import { GitCommit, TerminalSquare } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Textarea } from "../../../components/ui/textarea";
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

export const metadata: Metadata = {
  title: "Machine Room playground",
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
  "definitely_a_new_phase_we_have_not_seen",
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
    { name: "Hard fail", blocked: true, retryable: false },
    { name: "Transient retry", blocked: false, retryable: true },
    { name: "Plain error", blocked: false, retryable: false },
  ];

const FILTER_CHIPS: { label: string; count: string; active: boolean }[] = [
  { label: "Live", count: "02", active: true },
  { label: "Blocked", count: "01", active: false },
  { label: "Dirty", count: "03", active: false },
  { label: "Idle", count: "08", active: false },
];

const commit = {
  repoSlug: "jacksondr5/temporal",
  sha: "7c2f4e1ad8e90b63a4f1c0f9d4c8b1a3e9c7d6b2",
  targetSha: "a3b8d92f4c1e0a7b6d5c4b3a2e1f0d9c8b7a6e5d",
  message:
    "fix(rsc): replace manual debounce with useDeferredValue per CodeRabbit guidance\n\nThis aligns the streaming RSC implementation with the linked reviewer thread.",
  stats: { additions: 12, deletions: 4, files: 3 },
};

export default function StatusPlaygroundPage() {
  return (
    <div className="space-y-10">
      <header className="border border-border-hairline bg-surface-panel">
        <div className="border-b border-border-hairline bg-surface-charcoal-up px-5 py-3">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-status-live">
            Internal verification · Machine Room primitives
          </p>
        </div>
        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_360px]">
          <div>
            <h1 className="font-chrome text-display font-bold tracking-[0.005em] text-foreground">
              Status primitives playground
            </h1>
            <p className="mt-2 max-w-[80ch] text-body text-muted-foreground">
              Shared foundation sign-off for status marks, rails, component
              defaults, filter chips, panels, commit chips, stack traces, and
              Operator/Inspector mode examples.
            </p>
          </div>
          <div className="grid grid-cols-2 border border-border-hairline bg-surface-charcoal-deep font-mono text-mono-sm">
            <Metric label="Canvas" value="warm charcoal" />
            <Metric label="Accent" value="phosphor live" />
            <Metric label="Radius" value="0" />
            <Metric label="Motion" value="1.4s tick" />
          </div>
        </div>
      </header>

      <MarksSection />
      <RailsSection />
      <ControlsSection />
      <PanelSection />
      <CommitChipSection />
      <StackTraceSection />
      <ModeExamplesSection />
      <MappingsSection />
    </div>
  );
}

function MarksSection() {
  return (
    <Section title="Status Marks">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_KINDS.map((kind) => (
          <div
            key={kind}
            className="flex min-h-20 items-center gap-4 border border-border-hairline bg-surface-panel px-4 py-3"
          >
            <div className="flex h-10 w-10 items-center justify-center border border-border-hairline bg-surface-charcoal-up">
              <StatusMark status={kind} />
            </div>
            <div>
              <p className="font-chrome text-title font-semibold capitalize text-foreground">
                {kind}
              </p>
              <p className="font-mono text-mono-sm text-muted-foreground">
                status=&quot;{kind}&quot;
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RailsSection() {
  return (
    <Section title="Status Rails">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUS_KINDS.map((kind) => (
          <RailDemo key={kind} status={kind} label={`${kind} rail`} />
        ))}
      </div>
    </Section>
  );
}

function RailDemo({ status, label }: { status: StatusKind; label: string }) {
  return (
    <div className="flex min-h-20 items-stretch gap-4 border border-border-hairline bg-surface-panel py-3 pl-2 pr-4">
      <StatusRail status={status} className="self-stretch" />
      <div className="flex flex-col justify-center">
        <span className="font-chrome text-title font-semibold capitalize text-foreground">
          {label}
        </span>
        <span className="font-mono text-mono-sm text-muted-foreground">
          {status === "live" ? "motion=led-tick" : "motion=none"}
        </span>
      </div>
    </div>
  );
}

function ControlsSection() {
  return (
    <Section title="Controls">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border border-border-hairline bg-surface-panel">
          <PanelHeader>Buttons and filter chips</PanelHeader>
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap gap-3">
              <Button>Re-evaluate now</Button>
              <Button variant="outline">Inspect</Button>
              <Button variant="secondary">Sync</Button>
              <Button variant="ghost">View logs</Button>
              <Button variant="destructive">Hold</Button>
            </div>
            <div className="inline-flex border border-border-hairline bg-surface-charcoal-up p-1">
              {FILTER_CHIPS.map(({ label, count, active }) => (
                <button
                  key={label}
                  className={
                    active
                      ? "font-chrome bg-primary px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground"
                      : "font-chrome px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cream-dim hover:text-foreground"
                  }
                  type="button"
                >
                  {label}{" "}
                  <span className="font-mono text-[10px] font-normal">
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Live</Badge>
              <Badge variant="secondary">Reviewer</Badge>
              <Badge variant="outline">Deferred</Badge>
              <Badge variant="destructive">Blocked</Badge>
            </div>
          </div>
        </div>

        <div className="border border-border-hairline bg-surface-panel">
          <PanelHeader>Inputs, selects, and tabs</PanelHeader>
          <div className="space-y-4 p-4">
            <Input placeholder="workflowId or repo slug" />
            <Textarea placeholder="Operator note" />
            <Select defaultValue="operator">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="inspector">Inspector</SelectItem>
              </SelectContent>
            </Select>
            <Tabs defaultValue="agent">
              <TabsList>
                <TabsTrigger value="agent">Agent</TabsTrigger>
                <TabsTrigger value="reviewers">Reviewers</TabsTrigger>
                <TabsTrigger value="errors">Errors</TabsTrigger>
              </TabsList>
              <TabsContent
                value="agent"
                className="border border-border-hairline p-3"
              >
                Agent runs use the same status vocabulary as rows.
              </TabsContent>
              <TabsContent
                value="reviewers"
                className="border border-border-hairline p-3"
              >
                Reviewer events use the station-blue small square.
              </TabsContent>
              <TabsContent
                value="errors"
                className="border border-border-hairline p-3"
              >
                Error cards use the oxide blocked bar.
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </Section>
  );
}

function PanelSection() {
  return (
    <Section title="Panels">
      <div className="grid gap-4 xl:grid-cols-3">
        <PanelExample title="Rack panel" tone="text-status-live">
          <p className="text-body text-muted-foreground">
            Tonal depth comes from charcoal layers and hairline rules, not
            decorative shadows.
          </p>
        </PanelExample>
        <PanelExample title="Inset data" tone="text-status-healthy">
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 font-mono text-mono-sm">
            <dt className="text-muted-foreground">branch</dt>
            <dd>machine-room-foundation</dd>
            <dt className="text-muted-foreground">threads</dt>
            <dd>3 open / 11 logged</dd>
            <dt className="text-muted-foreground">reviewers</dt>
            <dd>2 settled</dd>
          </dl>
        </PanelExample>
        <PanelExample title="Commit artifact" tone="text-status-healthy">
          <div className="flex items-center gap-3 border border-status-healthy bg-surface-charcoal-up p-3">
            <GitCommit className="h-4 w-4 text-status-healthy" />
            <span className="font-chrome text-micro font-bold uppercase tracking-[0.18em] text-status-healthy">
              Commit
            </span>
            <span className="font-mono text-status-live">7c2f4e1</span>
          </div>
        </PanelExample>
      </div>
    </Section>
  );
}

function CommitChipSection() {
  return (
    <Section title="Commit Chip">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CommitChip
          repoSlug={commit.repoSlug}
          sha={commit.sha}
          message={commit.message}
          stats={commit.stats}
          expanded
        />
        <CommitChip
          repoSlug={commit.repoSlug}
          sha={commit.sha}
          targetSha={commit.targetSha}
          message={commit.message}
          mode="inspector"
          expanded
          stats={commit.stats}
        />
      </div>
    </Section>
  );
}

function StackTraceSection() {
  return (
    <Section title="Stack Trace Block">
      <pre className="max-h-[432px] overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words border border-border-hairline border-t-2 border-t-status-blocked bg-surface-charcoal-deep p-4 font-mono text-mono-sm leading-[1.65] text-muted-foreground [overflow-wrap:anywhere]">
        <span className="font-medium text-status-blocked">
          GitError: invalid credentials (HTTP 401)
        </span>
        {`\n    at `}
        <span className="text-foreground">authenticatedFetch</span>
        {` (apps/orchestrator/integrations/github/fetch.ts:`}
        <span className="text-status-live">87</span>
        {`)\n    at `}
        <span className="text-foreground">refreshWorkspace</span>
        {` (apps/orchestrator/activities/refresh-workspace.ts:`}
        <span className="text-status-live">42</span>
        {`)\n    at runActivity (apps/orchestrator/activities/retry-with-a-very-long-path-that-must-wrap-without-horizontal-scroll.ts:118)`}
      </pre>
    </Section>
  );
}

function ModeExamplesSection() {
  return (
    <Section title="Operator and Inspector Examples">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border border-border-hairline bg-surface-panel">
          <PanelHeader>Operator</PanelHeader>
          <div className="space-y-4 p-4">
            <h3 className="font-chrome text-headline font-bold uppercase tracking-[0.04em] text-foreground">
              12 open · 2 need operator
            </h3>
            <SignalLine status="live" label="Reviewing CodeRabbit feedback" />
            <SignalLine status="caution" label="Head moved during sweep" />
            <p className="max-w-[80ch] text-body text-muted-foreground">
              The agent is still working the review thread. Operator mode keeps
              the story readable and leaves internal identifiers out of view.
            </p>
          </div>
        </div>
        <div className="border border-border-hairline bg-surface-inspector text-foreground">
          <div
            className="h-1"
            style={{
              background:
                "repeating-linear-gradient(-45deg, oklch(0.85 0.18 95) 0, oklch(0.85 0.18 95) 8px, oklch(0.16 0.012 50) 8px, oklch(0.16 0.012 50) 14px)",
            }}
          />
          <PanelHeader tone="text-status-caution">Inspector</PanelHeader>
          <div className="space-y-4 p-4">
            <h3 className="font-mono text-[22px] font-semibold leading-tight">
              jacksondr5/temporal#211
            </h3>
            <div className="grid grid-cols-2 gap-2 font-mono text-mono-sm xl:grid-cols-4">
              <Metric label="phase" value="handling_code_rabbit" />
              <Metric label="dirty" value="true" />
              <Metric label="runId" value="prRun-92413" />
              <Metric label="provider" value="claude-code" />
            </div>
            <Button variant="outline" size="sm">
              view raw JSON
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function MappingsSection() {
  return (
    <Section title="Translation Tables">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MappingTable
          title="Phase to status"
          rows={SAMPLE_PHASES.map((phase) => ({
            internal: phase,
            kind: mapPhaseToStatus(phase),
            label: operatorPhaseLabel(phase),
          }))}
        />
        <MappingTable
          title="Run status to status"
          rows={SAMPLE_RUN_STATUSES.map((status) => ({
            internal: status,
            kind: mapRunStatusToStatus(status),
            label: operatorRunStatusLabel(status),
          }))}
        />
        <MappingTable
          title="Disposition to status"
          rows={SAMPLE_DISPOSITIONS.map((disposition) => ({
            internal: disposition ?? "(null)",
            kind: mapDispositionToStatus(disposition),
            label: operatorDispositionLabel(disposition),
          }))}
        />
        <MappingTable
          title="Error to status"
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
    <div className="border border-border-hairline bg-surface-panel">
      <PanelHeader>{title}</PanelHeader>
      <ul className="divide-y divide-border-hairline">
        {rows.map((row) => (
          <li
            key={row.internal}
            className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-2"
          >
            <StatusMark status={row.kind} />
            <code className="min-w-0 break-all font-mono text-mono-sm text-muted-foreground">
              {row.internal}
            </code>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="min-w-0 break-words text-body text-foreground">
              {row.label}
            </span>
            <span className="font-chrome text-micro font-bold uppercase tracking-[0.18em] text-muted-foreground sm:ml-auto">
              {row.kind}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalLine({ status, label }: { status: StatusKind; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <StatusMark status={status} />
      <span className="text-body text-foreground">{label}</span>
    </div>
  );
}

function PanelExample({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border-hairline bg-surface-panel">
      <PanelHeader tone={tone}>{title}</PanelHeader>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-border-hairline p-3">
      <dt className="font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-mono-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

function PanelHeader({
  children,
  tone = "text-status-live",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`border-b border-border-hairline bg-surface-charcoal-up px-4 py-2 font-mono text-micro font-medium uppercase tracking-[0.18em] ${tone}`}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <TerminalSquare className="h-4 w-4 text-status-live" aria-hidden />
        <h2 className="font-chrome text-title font-semibold uppercase tracking-[0.08em] text-foreground">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
