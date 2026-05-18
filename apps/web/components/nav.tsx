"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexConnectionState } from "convex/react";
import { ArrowLeft, GitPullRequest, Settings } from "lucide-react";
import { cn } from "../lib/utils";
import { StatusMark } from "./status-mark";

const navItems = [
  { href: "/", label: "Pull Requests", icon: GitPullRequest },
  { href: "/policies", label: "Policies", icon: Settings },
] as const;

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export function Nav() {
  const pathname = usePathname();
  const isInspector = pathname.includes("/inspect");
  const operatorHref = isInspector ? pathname.replace(/\/inspect$/, "") : null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border-hairline bg-surface-charcoal-up",
        isInspector && "bg-surface-inspector-panel",
      )}
    >
      {isInspector && (
        <div
          className="h-1"
          style={{
            background:
              "repeating-linear-gradient(-45deg, oklch(0.85 0.18 95) 0, oklch(0.85 0.18 95) 8px, oklch(0.15 0.01 240) 8px, oklch(0.15 0.01 240) 14px)",
          }}
        />
      )}
      <div className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-border-strong bg-surface-panel transition-colors group-hover:border-primary">
            <StatusMark
              status={isInspector ? "caution" : "live"}
              size="sm"
              label={null}
            />
          </div>
          <span className="font-chrome text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
            PR Review
          </span>
        </Link>

        {isInspector && operatorHref && (
          <Link
            href={operatorHref}
            className="inline-flex items-center gap-1.5 border border-status-caution/55 bg-status-caution/10 px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.18em] text-status-caution transition hover:bg-status-caution/15 hover:text-status-caution"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Operator
          </Link>
        )}

        <nav className="flex min-w-0 flex-wrap items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "font-chrome flex items-center gap-2 border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <ConnectionStateIndicator isInspector={isInspector} />
      </div>
    </header>
  );
}

function ConnectionStateIndicator({ isInspector }: { isInspector: boolean }) {
  if (!CONVEX_URL) return null;
  return <ConnectionStateIndicatorInner isInspector={isInspector} />;
}

function ConnectionStateIndicatorInner({
  isInspector,
}: {
  isInspector: boolean;
}) {
  const state = useConvexConnectionState();
  const isConnected = state.isWebSocketConnected;
  const status = isInspector ? "caution" : isConnected ? "live" : "caution";
  const label = isInspector ? "Inspect" : isConnected ? "Live" : "Reconnecting";

  return (
    <div className="flex items-center gap-2 sm:ml-auto">
      {isInspector && (
        <span className="border border-status-caution/55 bg-status-caution/10 px-2 py-1 font-mono text-micro uppercase tracking-[0.18em] text-status-caution">
          Inspect Mode
        </span>
      )}
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground"
      >
        <StatusMark status={status} size="sm" label={null} />
        {label}
      </span>
    </div>
  );
}
