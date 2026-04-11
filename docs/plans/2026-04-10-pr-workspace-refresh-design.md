# PR Workspace Refresh Design

**Goal:** Simplify persistent PR workspace preparation so each run starts from the latest remote PR branch state without reapplying repo settings on every pass.

**Decision:** Treat each workspace as dedicated to one PR branch. On first creation, clone that branch and configure git identity once. On reuse, trust the existing clone and only refresh it to `origin/<branch>` with `fetch`, `reset --hard`, and `clean -fd`.

**Why:** The existing flow re-set `origin`, reconfigured git identity, and recreated branch state on every run. That is unnecessarily defensive for a workspace that this orchestrator alone owns. It also increased failure surface during merge-fix preparation.

**Scope:**
- Update `apps/orchestrator/src/integrations/workspace.ts`
- Keep the rest of the agent runtime behavior unchanged
- Do not redesign merge-fix logic or shared workspace ownership rules

**Expected behavior:**
- First run for a PR creates a dedicated clone on the PR branch
- Later runs reuse that clone and refresh it to the latest remote branch tip
- Agents always start from a clean copy of the current PR branch state
