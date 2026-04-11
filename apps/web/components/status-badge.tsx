import { cn } from "../lib/utils";

/* ── Tiny inline status pill ── */
function StatusPill({
  children,
  className,
  dot,
}: {
  children: React.ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {dot && (
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dot)} />
      )}
      {children}
    </span>
  );
}

/* ── Phase badges ── */
const phaseConfig: Record<string, { label: string; cls: string; dot: string }> =
  {
    idle: {
      label: "Idle",
      cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
      dot: "bg-zinc-500",
    },
    refreshing: {
      label: "Refreshing",
      cls: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
      dot: "bg-sky-400 animate-status-pulse",
    },
    resolving_merge_conflicts: {
      label: "Merge Conflicts",
      cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
      dot: "bg-amber-400 animate-status-pulse",
    },
    resolve_merge_conflicts: {
      label: "Merge Conflicts",
      cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
      dot: "bg-amber-400 animate-status-pulse",
    },
    fixing_checks: {
      label: "Fixing Checks",
      cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
      dot: "bg-amber-400 animate-status-pulse",
    },
    handling_code_rabbit: {
      label: "Code Rabbit",
      cls: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
      dot: "bg-violet-400 animate-status-pulse",
    },
    running_special_reviewers: {
      label: "Reviewers",
      cls: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
      dot: "bg-indigo-400 animate-status-pulse",
    },
    recording_results: {
      label: "Recording",
      cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
      dot: "bg-emerald-400 animate-status-pulse",
    },
    terminal_cleanup: {
      label: "Terminal Cleanup",
      cls: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/20",
      dot: "bg-zinc-300 animate-status-pulse",
    },
  };

export function PhaseBadge({ phase }: { phase: string }) {
  const cfg = phaseConfig[phase] ?? {
    label: phase,
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
    dot: "bg-zinc-500",
  };
  return (
    <StatusPill className={cfg.cls} dot={cfg.dot}>
      {cfg.label}
    </StatusPill>
  );
}

const lifecycleConfig: Record<string, { label: string; cls: string; dot: string }> = {
  open: {
    label: "Open",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    dot: "bg-emerald-400",
  },
  closed: {
    label: "Closed",
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
    dot: "bg-zinc-500",
  },
  merged: {
    label: "Merged",
    cls: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
    dot: "bg-sky-400",
  },
};

export function LifecycleBadge({ lifecycleState }: { lifecycleState?: string }) {
  const effectiveState = lifecycleState ?? "open";
  const cfg = lifecycleConfig[effectiveState] ?? {
    label: effectiveState,
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
    dot: "bg-zinc-500",
  };
  return (
    <StatusPill className={cfg.cls} dot={cfg.dot}>
      {cfg.label}
    </StatusPill>
  );
}

/* ── Disposition badges ── */
const dispositionConfig: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  fix: {
    label: "Fix",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    dot: "bg-emerald-400",
  },
  false_positive: {
    label: "False Positive",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    dot: "bg-amber-400",
  },
  defer: {
    label: "Defer",
    cls: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
    dot: "bg-sky-400",
  },
};

export function DispositionBadge({
  disposition,
}: {
  disposition: string | null;
}) {
  if (!disposition) {
    return (
      <StatusPill
        className="bg-zinc-500/10 text-zinc-500 ring-zinc-500/20"
        dot="bg-zinc-600"
      >
        Pending
      </StatusPill>
    );
  }
  const cfg = dispositionConfig[disposition] ?? {
    label: disposition,
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
    dot: "bg-zinc-500",
  };
  return (
    <StatusPill className={cfg.cls} dot={cfg.dot}>
      {cfg.label}
    </StatusPill>
  );
}

/* ── Run status badges ── */
const runStatusConfig: Record<
  string,
  { cls: string; dot: string }
> = {
  running: {
    cls: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
    dot: "bg-sky-400 animate-status-pulse",
  },
  completed: {
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    dot: "bg-emerald-400",
  },
  failed: {
    cls: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
    dot: "bg-rose-400",
  },
  blocked: {
    cls: "bg-rose-500/15 text-rose-400 ring-rose-500/25",
    dot: "bg-rose-400 animate-status-pulse",
  },
  skipped: {
    cls: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20",
    dot: "bg-zinc-600",
  },
};

export function RunStatusBadge({ status }: { status: string }) {
  const cfg = runStatusConfig[status] ?? {
    cls: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
    dot: "bg-zinc-500",
  };
  return (
    <StatusPill className={cfg.cls} dot={cfg.dot}>
      {status}
    </StatusPill>
  );
}

/* ── Error type badges ── */
export function ErrorTypeBadge({
  blocked,
  retryable,
}: {
  blocked: boolean;
  retryable: boolean;
}) {
  if (blocked) {
    return (
      <StatusPill
        className="bg-rose-500/15 text-rose-400 ring-rose-500/25"
        dot="bg-rose-400 animate-status-pulse"
      >
        Blocked
      </StatusPill>
    );
  }
  if (retryable) {
    return (
      <StatusPill
        className="bg-amber-500/10 text-amber-400 ring-amber-500/20"
        dot="bg-amber-400"
      >
        Retryable
      </StatusPill>
    );
  }
  return (
    <StatusPill
      className="bg-zinc-500/10 text-zinc-400 ring-zinc-500/20"
      dot="bg-zinc-500"
    >
      Error
    </StatusPill>
  );
}

/* ── Dirty indicator ── */
export function DirtyBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <StatusPill
      className="bg-amber-500/10 text-amber-400 ring-amber-500/20"
      dot="bg-amber-400 animate-status-pulse"
    >
      Dirty
    </StatusPill>
  );
}
