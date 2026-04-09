"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { GitPullRequest, Settings, Radio } from "lucide-react";

const navItems = [
  { href: "/", label: "Pull Requests", icon: GitPullRequest },
  { href: "/policies", label: "Policies", icon: Settings },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30 group-hover:bg-primary/25 transition-colors">
            <Radio className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold tracking-tight text-foreground">
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
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-status-pulse" />
          Live
        </div>
      </div>
    </header>
  );
}
