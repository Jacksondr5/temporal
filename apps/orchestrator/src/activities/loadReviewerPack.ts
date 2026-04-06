import { loadRuntimeConfig } from '../config';
import {
  ensureReviewerPacksRepo,
  loadReviewerPack,
} from '../integrations/reviewerPacks';

export async function loadReviewerPackDefinition(
  reviewerId: string,
): Promise<{
  reviewerId: string;
  repoPath: string;
  repoCommitSha: string | null;
  entrypointPath: string;
  knowledgeFilePaths: string[];
}> {
  const config = loadRuntimeConfig();
  const ensuredRepo = await ensureReviewerPacksRepo({
    repoPath: config.reviewerPacksRepoPath,
    repoUrl: config.reviewerPacksRepoUrl,
  });
  const pack = await loadReviewerPack(ensuredRepo.repoPath, reviewerId);

  return {
    reviewerId: pack.entry.id,
    repoPath: pack.repoPath,
    repoCommitSha: ensuredRepo.repoCommitSha,
    entrypointPath: pack.entrypointPath,
    knowledgeFilePaths: pack.knowledgeFilePaths,
  };
}
