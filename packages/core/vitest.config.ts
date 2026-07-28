import { defineConfig } from 'vitest/config';

// The core suite runs 80+ files in parallel. Several ingest tests do real
// PDF/OCR-shaped work that finishes in well under a second locally but has
// intermittently exceeded vitest's 5s default on loaded CI runners, failing
// releases for timing rather than for a genuine regression. The budget below is
// a ceiling for catching hangs, not a target — nothing here should approach it.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
