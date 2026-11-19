import React from "react";

/**
 * 全局兜底（2026-11-20）：页面任何地方报错时不再整屏白屏，而是显示「出错了」和刷新按钮，
 * 并把错误信息自动发到反馈（类型 Bug，每次打开页面最多 1 条）方便排查。
 * 版本更新后旧页面加载不到新文件（常见于微信内置浏览器缓存）时，自动刷新一次。
 */
let reported = false;
export function reportCrash(err: unknown, where: string) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}\n${(err.stack ?? "").slice(0, 700)}` : String(err);
  try {
    if (/dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|error loading dynamically/i.test(msg)) {
      if (!sessionStorage.getItem("crash-reloaded")) {
        sessionStorage.setItem("crash-reloaded", "1");
        location.reload();
        return;
      }
    }
  } catch {}
  if (reported) return;
  reported = true;
  try {
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "bug", game: "自动错误报告", text: `[${where}] ${msg}`.slice(0, 1000), page: location.href.slice(0, 200) }),
    }).catch(() => {});
  } catch {}
}

// 浏览器「全文翻译」会改写页面文字节点，React 更新时找不到原节点就会整页崩溃（白屏）。
// 这里让 removeChild / insertBefore 在节点已被翻译替换时安静跳过，而不是抛错。
if (typeof Node !== "undefined") {
  const rm = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return rm.call(this, child) as T;
  };
  const ins = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return ins.call(this, node, null) as T;
    return ins.call(this, node, ref) as T;
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => reportCrash(e.error ?? e.message, "window"));
  window.addEventListener("unhandledrejection", (e) => reportCrash(e.reason, "promise"));
}

export class CrashGuard extends React.Component<{ children: React.ReactNode }, { err: unknown }> {
  state = { err: null as unknown };
  static getDerivedStateFromError(err: unknown) {
    return { err };
  }
  componentDidCatch(err: unknown) {
    reportCrash(err, "render");
  }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err;
    const text = e instanceof Error ? e.message : String(e);
    return (
      <main data-testid="crash-screen" style={{ minHeight: "100vh", background: "#141b1e", color: "#efe6cf", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 10px" }}>出错了，页面没能显示出来</h2>
          <p style={{ opacity: 0.8, lineHeight: 1.6 }}>错误信息已经自动发给开发者。可以先点「刷新」重新进入房间（你的座位会保留）。</p>
          <p style={{ fontSize: 12, opacity: 0.55, wordBreak: "break-all" }}>{text.slice(0, 200)}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <button style={{ minHeight: 48, padding: "0 22px", fontSize: 17 }} onClick={() => location.reload()}>刷新</button>
            <button style={{ minHeight: 48, padding: "0 22px", fontSize: 17 }} onClick={() => (location.href = "/")}>回大厅</button>
          </div>
        </div>
      </main>
    );
  }
}
