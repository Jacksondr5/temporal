import type { LinearRuntimeConfig } from '../config.js';

export interface LinearClient {
  readonly hasApiKey: boolean;
  readonly teamId: string | null;
  readonly defaultProjectId: string | null;
}

export function createLinearClient(config: LinearRuntimeConfig): LinearClient {
  return {
    hasApiKey: config.apiKey !== null,
    teamId: config.teamId,
    defaultProjectId: config.defaultProjectId,
  };
}
