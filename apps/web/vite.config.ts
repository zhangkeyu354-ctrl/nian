import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tailwindcss()],
  // 版本号：Render 构建时取提交号，本地为 local（设置页面底部显示）
  define: {
    __APP_VERSION__: JSON.stringify(
      (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || "local",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // 开发时把联机请求转发到本地服务器（npm run server）
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
      "/api": "http://127.0.0.1:3000",
    },
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
      deny: ["**/reference/**", "**/.git/**", "**/.env*"],
    },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
