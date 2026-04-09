import type { RepositoryRef } from './github.js';

export type CheckClassification =
  | 'fixable_blocking'
  | 'ignored_nonblocking'
  | 'informational';

export interface SpecializedReviewerDefinition {
  id: string;
  description: string;
  fileGlobs: string[];
  runPolicy: 'once_per_sha' | 'once_per_pr';
  promptId: string;
}

export interface RepositoryPolicy {
  repository: RepositoryRef;
  fixableChecks: string[];
  ignoredChecks: string[];
  specializedReviewers: SpecializedReviewerDefinition[];
}

export interface CheckClassificationResult {
  name: string;
  classification: CheckClassification;
}

export function parseRepositorySlug(slug: string): RepositoryRef {
  const [owner, name] = slug.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid repository slug "${slug}"`);
  }

  return {
    owner,
    name,
  };
}
