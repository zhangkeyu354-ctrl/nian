import { build, preview, loadConfigFromFile } from "vite";
import { resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
const frozen = new Set([
  "apps/web/src/wt/WitchTown.tsx",
  "apps/web/src/wt/live.css",
  "apps/web/src/drawing/studio.css",
  "apps/web/src/dm/polish.css",
]);
const { config } = await loadConfigFromFile(
  { command: "build", mode: "production" },
  resolve("apps/web/vite.config.ts"),
);
const baseline = {
  ...config,
  configFile: false,
  plugins: [
    {
      name: "main-baseline",
      enforce: "pre",
      load(id) {
        const rel = relative(process.cwd(), id.split("?")[0]).replaceAll(
          "\\",
          "/",
        );
        if (frozen.has(rel))
          return execFileSync("git", ["show", "4cfcbef:" + rel], {
            encoding: "utf8",
          });
      },
    },
    ...config.plugins,
  ],
  build: {
    ...config.build,
    outDir: resolve("output/mobile-fix-1027/baseline-web"),
  },
};
await build(baseline);
await preview({
  ...baseline,
  preview: {
    host: "127.0.0.1",
    port: 3448,
    strictPort: true,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3447", ws: true },
      "/api": "http://127.0.0.1:3447",
    },
  },
});
console.log("Baseline 4cfcbef ready: http://127.0.0.1:3448");
