# Worktree Bootstrap
New Git worktrees in this repo may be missing env files and/or `node_modules/` when first created. Before running the app, Playwright, or any project scripts, run the bootstrap script:

```bash
scripts/bootstrap-worktree.sh
```

The script will:
- Locate the primary checkout via `git worktree list`
- Copy `.env`, `.env.local`, and `apps/web/.env.local` from the main checkout (skips files that already exist)
- Run `pnpm install` if `node_modules/` is absent

To overwrite existing env files (e.g. after a credentials rotation), pass `--force-env`:

```bash
scripts/bootstrap-worktree.sh --force-env
```


<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
