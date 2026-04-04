import { loadClientConnectConfig } from '@temporalio/envconfig';

export interface TemporalRuntimeConfig {
  connectionOptions: ReturnType<typeof loadClientConnectConfig>['connectionOptions'];
  namespace: string;
  taskQueue: string;
}

export function loadTemporalRuntimeConfig(): TemporalRuntimeConfig {
  const config = loadClientConnectConfig();

  return {
    connectionOptions: config.connectionOptions,
    namespace: config.namespace ?? 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hello-world',
  };
}
