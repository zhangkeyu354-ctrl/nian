import "./update-banner.css";
import { useEffect, useState } from "react";
declare const __APP_VERSION__: string;

/**
 * 网站更新提示（2026-11-23）：页面每分钟问一次服务器当前版本，
 * 和自己打开时的版本不一样，就在顶部提示「网站已更新，刷新一下」。
 * 联机房间和座位都存在服务器上，刷新后会回到原来的房间。
 */
export function UpdateBanner() {
  const [newer, setNewer] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (__APP_VERSION__ === "local") return;
    const check = () =>
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((h) => {
          if (h?.version && h.version !== "local" && h.version !== __APP_VERSION__) setNewer(h.version);
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 60000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  if (!newer || hidden) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <span>网站刚更新了新版本，刷新一下就能用上</span>
      <button onClick={() => location.reload()}>刷新</button>
      <button className="update-banner-x" aria-label="稍后再说" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}
