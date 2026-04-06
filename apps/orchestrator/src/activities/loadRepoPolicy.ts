import { loadRuntimeConfig } from '../config';
import type { RepositoryRef } from '../domain/github';
import type { RepositoryPolicy } from '../domain/policy';
import { createConvexClient } from '../integrations/convex';

export async function loadRepoPolicy(
  repository: RepositoryRef,
): Promise<RepositoryPolicy | null> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  return await convex.getRepoPolicy(`${repository.owner}/${repository.name}`);
}
