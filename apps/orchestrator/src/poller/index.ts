import { runPoller } from './runPoller.js';

runPoller().catch((error) => {
  console.error(error);
  process.exit(1);
});
