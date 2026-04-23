import { failPersistedIngestJob } from './job-store.js';
import { runPersistedIngestJobWorker } from './job-worker.js';

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const jobId = process.argv[2];
  if (!jobId) {
    throw new Error('A persisted ingest job id is required.');
  }

  const failSafely = (error: unknown) => {
    try {
      failPersistedIngestJob(jobId, normalizeErrorMessage(error));
    } catch {
      // Best effort only.
    }
  };

  process.on('uncaughtException', (error) => {
    failSafely(error);
    console.error(normalizeErrorMessage(error));
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    failSafely(reason);
    console.error(normalizeErrorMessage(reason));
    process.exit(1);
  });

  await runPersistedIngestJobWorker(jobId);
}

main().catch((error) => {
  const message = normalizeErrorMessage(error);
  const jobId = process.argv[2];
  if (jobId) {
    try {
      failPersistedIngestJob(jobId, message);
    } catch {
      // Best effort only.
    }
  }
  console.error(message);
  process.exitCode = 1;
});
