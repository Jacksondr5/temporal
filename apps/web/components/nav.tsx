"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";
import { GitPullRequest, Settings, Radio } from "lucide-react";

const navItems = [
  { href: "/", label: "Pull Requests", icon: GitPullRequest },
  { href: "/policies", label: "Policies", icon: Settings },
] as const;

export function Nav() {
  const pathname = usePathname();
  const isInspector = pathname.includes("/inspect");

  return (
    <header className="sticky top-0 z-50 border-b border-border-hairline bg-surface-charcoal-up">
      {isInspector && (
        <div
          className="h-1"
          style={{
            background:
              "repeating-linear-gradient(-45deg, oklch(0.85 0.18 95) 0, oklch(0.85 0.18 95) 8px, oklch(0.16 0.012 50) 8px, oklch(0.16 0.012 50) 14px)",
          }}
        />
      )}
      <div className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-border-strong bg-surface-panel transition-colors group-hover:border-primary">
            <Radio
              className={cn(
                "h-3.5 w-3.5",
                isInspector ? "text-status-caution" : "text-status-live",
              )}
            />
          </div>
          <span className="font-chrome text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
            PR Review
          </span>
        </Link>

        <nav className="flex min-w-0 flex-wrap items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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

        <div className="flex items-center gap-2 font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground sm:ml-auto">
          <span
            className={cn(
              "inline-block h-3 w-3 animate-led-tick",
              isInspector ? "bg-status-caution" : "bg-status-live",
            )}
          />
          {isInspector ? "Inspect" : "Live"}
        </div>
      </div>
    </header>
  );
}
