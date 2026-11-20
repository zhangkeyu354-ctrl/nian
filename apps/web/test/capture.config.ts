import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    // Capture hooks serialize every legal replay state, substantially more work
    // than the underlying unit tests. Keep all assertions; allow local machines
    // the same 20-second budget used for the full regression run.
    testTimeout: 20_000,
    maxWorkers: 2,
    include: ["packages/game-engine/test/**/*.test.{ts,tsx}"],
    // Automated matches are covered by the main suite and are not mobile UI fixtures.
    exclude: ["packages/game-engine/test/bot.test.ts", "packages/game-engine/test/practice-room.test.ts"],
    setupFiles: ["apps/web/test/capture.setup.ts"],
  },
});
