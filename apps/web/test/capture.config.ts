import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/game-engine/test/**/*.test.{ts,tsx}"],
    setupFiles: ["apps/web/test/capture.setup.ts"],
  },
});
