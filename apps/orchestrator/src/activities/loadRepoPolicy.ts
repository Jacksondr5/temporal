import { loadRuntimeConfig } from '../config.js';
import type { RepositoryRef } from '../domain/github.js';
import type { RepositoryPolicy } from '../domain/policy.js';
import { createConvexClient } from '../integrations/convex.js';

export async function loadRepoPolicy(
  repository: RepositoryRef,
): Promise<RepositoryPolicy | null> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  return await convex.getRepoPolicy(`${repository.owner}/${repository.name}`);
}
