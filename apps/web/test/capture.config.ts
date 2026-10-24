import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // Capture hooks serialize every legal replay state, substantially more work
    // than the underlying unit tests. Keep all assertions; allow local machines
    // the same 20-second budget used for the full regression run.
    testTimeout: 20_000,
    maxWorkers: 2,
    include: ["packages/game-engine/test/**/*.test.{ts,tsx}"],
    setupFiles: ["apps/web/test/capture.setup.ts"],
  },
});
