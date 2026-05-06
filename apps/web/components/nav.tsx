"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitPullRequest, Radio, Settings } from "lucide-react";
import { useConvexConnectionState } from "convex/react";
import { cn } from "../lib/utils";
import { StatusMark } from "./status-mark";

/**
 * `<Nav />` — global app chrome.
 *
 * Restyled onto the redesign's canonical tokens and type scale (see
 * `docs/product/operator-ui-redesign.md` → "Per-Screen Direction" →
 * "Navigation"): warm dark canvas surfaces, hairline borders, the new
 * `text-title` / `text-meta` scale, and a 14px lucide icon size to match
 * the iconography rules for dense rows.
 *
 * The previous static "Live" dot is replaced by a small connection-state
 * indicator built from the canonical `<StatusMark />` primitive:
 *   - `live`    when the Convex WebSocket subscription is connected.
 *   - `caution` when the client has dropped the WebSocket and is
 *               reconnecting (or has not yet connected on first paint).
 */

const navItems = [
  { href: "/", label: "Pull Requests", icon: GitPullRequest },
  { href: "/policies", label: "Policies", icon: Settings },
] as const;

// Mirrors the gating in `convex-provider.tsx` so the connection-state hook
// only runs when a real `ConvexProvider` is mounted in the tree above.
// `NEXT_PUBLIC_*` env vars are inlined at build time, so the two checks are
// guaranteed to agree.
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border-hairline bg-surface-panel/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              "bg-status-live/15 ring-1 ring-status-live/30",
              "transition-colors group-hover:bg-status-live/25",
            )}
          >
            <Radio className="h-3.5 w-3.5 text-status-live" />
          </div>
          <span className="text-title font-semibold tracking-tight text-foreground">
            PR Review
          </span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5",
                  "text-meta font-medium transition-colors",
                  isActive
                    ? "bg-status-live/10 text-status-live"
                    : "text-muted-foreground hover:bg-surface-panel-hover hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <ConnectionStateIndicator />
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Connection-state indicator.

   Verified against the project's installed `convex` (`^1.34.1` per
   `apps/web/package.json`):
     - `useConvexConnectionState()` is exported from `convex/react`.
     - `ConnectionState.isWebSocketConnected` is the canonical "is the live
       subscription stream up" boolean. When false, the client is either
       making its first connection or actively reconnecting; both map to
       the same operator-facing "Reconnecting" state per the redesign doc.

   The hook throws if it runs outside a `ConvexProvider`, so the inner
   subscriber only mounts when `NEXT_PUBLIC_CONVEX_URL` is set — matching
   the fall-through in `convex-provider.tsx` so static builds without the
   env var still render.
   ────────────────────────────────────────────────────────────────────── */
function ConnectionStateIndicator() {
  if (!CONVEX_URL) return null;
  return <ConnectionStateIndicatorInner />;
}

function ConnectionStateIndicatorInner() {
  const state = useConvexConnectionState();
  const isConnected = state.isWebSocketConnected;
  const status = isConnected ? "live" : "caution";
  const label = isConnected ? "Live" : "Reconnecting";

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "ml-auto inline-flex items-center gap-2 text-meta text-muted-foreground",
        // Motion lives at the indicator level, not on the mark itself
        // (StatusMark is intentionally static per Principle 4). The live
        // state pulses so an at-a-glance scan of the chrome reads as "this
        // app is alive"; the caution state breathes amber so a dropped
        // socket is noticeable without being alarming.
        isConnected ? "animate-rail-pulse" : "animate-rail-breath",
      )}
    >
      <StatusMark status={status} size="sm" label={null} />
      {label}
    </span>
  );
}
