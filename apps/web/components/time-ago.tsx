"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function isRecent(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs < 300_000; // 5 minutes
}

export function TimeAgo({
  date,
  className,
}: {
  date: string | null;
  className?: string;
}) {
  const [text, setText] = useState(() => formatTimeAgo(date));
  const [recent, setRecent] = useState(() => isRecent(date));

  useEffect(() => {
    setText(formatTimeAgo(date));
    setRecent(isRecent(date));
    const interval = setInterval(() => {
      setText(formatTimeAgo(date));
      setRecent(isRecent(date));
    }, 15_000);
    return () => clearInterval(interval);
  }, [date]);

  return (
    <time
      dateTime={date ?? undefined}
      title={date ?? "Never"}
      className={cn(
        "text-[13px] font-mono tabular-nums",
        recent ? "text-emerald-400" : "text-muted-foreground",
        className,
      )}
    >
      {text}
    </time>
  );
}
