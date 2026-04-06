import { runPoller } from './runPoller';

runPoller().catch((error) => {
  console.error(error);
  process.exit(1);
});
