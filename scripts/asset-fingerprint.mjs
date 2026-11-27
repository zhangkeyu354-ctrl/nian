// 计算 apps/web/public 下所有静态素材的指纹（路径 + 内容哈希）。
// GitHub Pages 部署时写到 fingerprint.txt；服务器启动时算同样的指纹，两者一致才把图片转发到 Pages。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
export function assetFingerprint(root) {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(root, "assets"));
  walk(join(root, "fonts"));
  const h = createHash("sha1");
  for (const f of files) h.update(relative(root, f).split("\\").join("/") + "\0" + createHash("sha1").update(readFileSync(f)).digest("hex") + "\n");
  return h.digest("hex");
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  process.stdout.write(assetFingerprint(process.argv[2] ?? "apps/web/public"));
}
