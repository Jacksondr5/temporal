import { heartbeat } from '@temporalio/activity';

export async function withActivityHeartbeat<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  heartbeat({ label, state: 'started', at: new Date().toISOString() });

  const interval = setInterval(() => {
    heartbeat({ label, state: 'running', at: new Date().toISOString() });
  }, 30_000);

  try {
    return await run();
  } finally {
    clearInterval(interval);
  }
}
