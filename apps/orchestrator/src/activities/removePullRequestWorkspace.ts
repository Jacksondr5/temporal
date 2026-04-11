import type { PullRequestRef } from '../domain/github.js';
import { loadRuntimeConfig } from '../config.js';
import { createWorkspaceManager } from '../integrations/workspace.js';

export async function removePullRequestWorkspace(pr: PullRequestRef): Promise<void> {
  const config = loadRuntimeConfig();
  const workspaceManager = createWorkspaceManager({
    workspaceRoot: config.workspaceRoot,
    github: config.github,
    gitIdentity: config.gitIdentity,
  });

  await workspaceManager.removePullRequestWorkspace(pr);
}
