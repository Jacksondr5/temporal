import type { RepositoryRef } from '../domain/github.js';

export function discoverAllowedRepositories(allowedRepos: string[]): RepositoryRef[] {
  return allowedRepos
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [owner, name] = entry.split('/');
      if (!owner || !name) {
        throw new Error(
          `Invalid GITHUB_ALLOWED_REPOS entry "${entry}". Expected owner/name.`,
        );
      }

      return { owner, name };
    });
}
