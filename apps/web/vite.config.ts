import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
      deny: ["**/reference/**", "**/.git/**", "**/.env*"],
    },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
