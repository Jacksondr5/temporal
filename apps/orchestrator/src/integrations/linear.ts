import type { LinearRuntimeConfig } from '../config.js';

export interface LinearClient {
  readonly teamId: string;
  readonly defaultProjectId: string;
}

export function createLinearClient(config: LinearRuntimeConfig): LinearClient {
  return {
    teamId: config.teamId,
    defaultProjectId: config.defaultProjectId,
  };
}
