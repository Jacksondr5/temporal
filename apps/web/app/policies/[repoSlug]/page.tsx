"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { use, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertCircle,
  Settings,
} from "lucide-react";

interface ReviewerDraft {
  id: string;
  description: string;
  fileGlobs: string;
  runPolicy: "once_per_sha" | "once_per_pr";
  promptId: string;
}

export default function PolicyEditPage({
  params,
}: {
  params: Promise<{ repoSlug: string }>;
}) {
  const { repoSlug } = use(params);
  const decodedSlug = decodeURIComponent(repoSlug);

  const detail = useQuery(api.ui.getRepoPolicyDetail, {
    repoSlug: decodedSlug,
  });
  const upsertRepo = useMutation(api.repos.upsert);
  const upsertPolicy = useMutation(api.repoPolicies.upsert);

  const [enabled, setEnabled] = useState(true);
  const [fixableChecks, setFixableChecks] = useState("");
  const [ignoredChecks, setIgnoredChecks] = useState("");
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([]);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (detail && !initialized) {
      if (detail.repo) setEnabled(detail.repo.enabled);
      if (detail.policy) {
        setFixableChecks(detail.policy.fixableChecks.join("\n"));
        setIgnoredChecks(detail.policy.ignoredChecks.join("\n"));
        setReviewers(
          detail.policy.specializedReviewers.map((r) => ({
            ...r,
            fileGlobs: r.fileGlobs.join(", "),
          })),
        );
      }
      setInitialized(true);
    }
  }, [detail, initialized]);

  const addReviewer = useCallback(() => {
    setReviewers((prev) => [
      ...prev,
      {
        id: `reviewer-${Date.now()}`,
        description: "",
        fileGlobs: "",
        runPolicy: "once_per_sha",
        promptId: "",
      },
    ]);
  }, []);

  const removeReviewer = useCallback((index: number) => {
    setReviewers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateReviewer = useCallback(
    (index: number, field: keyof ReviewerDraft, value: string) => {
      setReviewers((prev) =>
        prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const parsedFixable = fixableChecks
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedIgnored = ignoredChecks
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedReviewers = reviewers.map((r) => ({
        id: r.id,
        description: r.description,
        fileGlobs: r.fileGlobs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        runPolicy: r.runPolicy as "once_per_sha" | "once_per_pr",
        promptId: r.promptId,
      }));

      const [owner, name] = decodedSlug.includes("/")
        ? decodedSlug.split("/", 2)
        : ["", decodedSlug];

      await upsertRepo({
        slug: decodedSlug,
        owner: owner || detail?.repo?.owner || "",
        name: name || detail?.repo?.name || "",
        enabled,
      });

      await upsertPolicy({
        repoSlug: decodedSlug,
        fixableChecks: parsedFixable,
        ignoredChecks: parsedIgnored,
        specializedReviewers: parsedReviewers,
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save policy:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-32 rounded animate-shimmer" />
        <div className="h-8 w-72 rounded animate-shimmer" />
        <div className="h-64 w-full rounded-lg animate-shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/policies"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors mb-3"
          >
            <ArrowLeft className="h-3 w-3" /> Policies
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            {decodedSlug}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure check handling and specialized reviewers
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 text-xs"
          size="sm"
        >
          {saveStatus === "saving" ? (
            "Saving..."
          ) : saveStatus === "saved" ? (
            <>
              <CheckCircle className="h-3.5 w-3.5" /> Saved
            </>
          ) : saveStatus === "error" ? (
            <>
              <AlertCircle className="h-3.5 w-3.5" /> Error
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Save
            </>
          )}
        </Button>
      </div>

      {/* Repository enabled toggle */}
      <Section title="Repository">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Enable polling</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When disabled, the poller skips this repository
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </Section>

      {/* Check classifications */}
      <Section title="Check Classifications">
        <div className="space-y-5">
          <FieldGroup
            label="Fixable Checks"
            description="Check names to auto-fix on failure. One per line."
          >
            <Textarea
              value={fixableChecks}
              onChange={(e) => setFixableChecks(e.target.value)}
              placeholder={"lint\ntypecheck\nbuild"}
              rows={4}
              className="font-mono text-xs bg-muted/30 border-border/60 focus:border-primary/40 focus:ring-primary/20"
            />
          </FieldGroup>
          <div className="border-t border-border/40" />
          <FieldGroup
            label="Ignored Checks"
            description="Check names to ignore completely. One per line."
          >
            <Textarea
              value={ignoredChecks}
              onChange={(e) => setIgnoredChecks(e.target.value)}
              placeholder={"codecov\ncoverage"}
              rows={4}
              className="font-mono text-xs bg-muted/30 border-border/60 focus:border-primary/40 focus:ring-primary/20"
            />
          </FieldGroup>
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
            className="text-xs gap-1.5 border-border/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        }
      >
        {reviewers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Settings className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-xs">No reviewers configured</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviewers.map((reviewer, index) => (
              <div
                key={index}
                className="space-y-4 rounded-md border border-border/40 bg-muted/10 p-4"
              >
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider"
                  >
                    Reviewer #{index + 1}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReviewer(index)}
                    className="text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="ID">
                    <Input
                      value={reviewer.id}
                      onChange={(e) =>
                        updateReviewer(index, "id", e.target.value)
                      }
                      placeholder="security-reviewer"
                      className="font-mono text-xs bg-muted/30 border-border/60"
                    />
                  </FieldGroup>
                  <FieldGroup label="Run Policy">
                    <select
                      value={reviewer.runPolicy}
                      onChange={(e) =>
                        updateReviewer(index, "runPolicy", e.target.value)
                      }
                      className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 text-foreground"
                    >
                      <option value="once_per_sha">Once per SHA</option>
                      <option value="once_per_pr">Once per PR</option>
                    </select>
                  </FieldGroup>
                </div>

                <FieldGroup label="Description">
                  <Input
                    value={reviewer.description}
                    onChange={(e) =>
                      updateReviewer(index, "description", e.target.value)
                    }
                    placeholder="Reviews security-sensitive files"
                    className="text-xs bg-muted/30 border-border/60"
                  />
                </FieldGroup>

                <FieldGroup
                  label="File Globs"
                  description="Comma-separated glob patterns"
                >
                  <Input
                    value={reviewer.fileGlobs}
                    onChange={(e) =>
                      updateReviewer(index, "fileGlobs", e.target.value)
                    }
                    placeholder="src/auth/**, *.security.ts"
                    className="font-mono text-xs bg-muted/30 border-border/60"
                  />
                </FieldGroup>

                <FieldGroup label="Prompt ID">
                  <Input
                    value={reviewer.promptId}
                    onChange={(e) =>
                      updateReviewer(index, "promptId", e.target.value)
                    }
                    placeholder="security-review-v1"
                    className="font-mono text-xs bg-muted/30 border-border/60"
                  />
                </FieldGroup>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── Card-like section ── */
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
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/80">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/* ── Labelled field group ── */
function FieldGroup({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground/80">{label}</Label>
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}
