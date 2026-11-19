import React, { useEffect, useState } from "react";

const TYPES = [
  { id: "idea", label: "💡 建议" },
  { id: "bug", label: "🐞 Bug" },
  { id: "game", label: "🎲 想玩的新游戏" },
] as const;

export function FeedbackSheet({ games, onClose, defaultGame = "" }: { games: string[]; onClose: () => void; defaultGame?: string }) {
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("idea");
  const [game, setGame] = useState(defaultGame);
  const [text, setText] = useState("");
  const [contact, setContact] = useState(() => {
    try {
      return localStorage.getItem("fb:contact") ?? "";
    } catch {
      return "";
    }
  });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const send = async () => {
    setErr("");
    setState("sending");
    try {
      try {
        localStorage.setItem("fb:contact", contact);
      } catch {}
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, game: type === "game" ? "" : game, text, contact, page: location.pathname + location.search }),
      }).then((x) => x.json());
      if (!r.ok) throw Error(r.error || "提交失败");
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "提交失败");
      setState("idle");
    }
  };
  const placeholder =
    type === "bug" ? "发生了什么？在哪一步？比如：骷髅王第 3 轮出牌后卡住不动" : type === "game" ? "想玩什么游戏？可以写名字或者大概玩法" : "哪里可以更好？想要什么功能？";
  return (
    <div className="hall-sheet-bg" onClick={onClose}>
      <div className="hall-sheet fb-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="反馈" data-testid="fb-sheet">
        <span className="hall-grab" />
        {state === "done" ? (
          <div className="fb-done">
            <div className="fb-done-icon">🙏</div>
            <h2>收到啦，谢谢！</h2>
            <p>我们会认真看每一条反馈。</p>
            <button className="hall-primary fb-btn" onClick={onClose} data-testid="fb-close">
              好的
            </button>
          </div>
        ) : (
          <>
            <h2>建议 · 反馈</h2>
            <div className="fb-types">
              {TYPES.map((t) => (
                <button key={t.id} className={type === t.id ? "on" : ""} onClick={() => setType(t.id)} data-testid={"fb-type-" + t.id}>
                  {t.label}
                </button>
              ))}
            </div>
            {type !== "game" && (
              <label className="fb-field">
                <span>关于哪个游戏（可不选）</span>
                <select value={game} onChange={(e) => setGame(e.target.value)} data-testid="fb-game">
                  <option value="">整个网站 / 不确定</option>
                  {games.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="fb-field">
              <span>内容</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={1000} rows={5} data-testid="fb-text" />
              <small>{text.length}/1000</small>
            </label>
            <label className="fb-field">
              <span>怎么称呼你（可不填，方便我们问细节）</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={60} placeholder="昵称 / 微信 / LINE" data-testid="fb-contact" />
            </label>
            {err && <p className="fb-err">{err}</p>}
            <button className="hall-primary fb-btn" disabled={state === "sending" || text.trim().length < 2} onClick={send} data-testid="fb-send">
              {state === "sending" ? "提交中…" : "提交"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 管理员看反馈：/?view=feedback&key=... */
export function FeedbackAdmin() {
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const key = new URLSearchParams(location.search).get("key") ?? "";
    fetch("/api/feedback?key=" + encodeURIComponent(key))
      .then((r) => r.json())
      .then((r) => (r.ok ? setItems(r.items) : setErr(r.error)))
      .catch(() => setErr("加载失败"));
  }, []);
  const label: Record<string, string> = { idea: "💡 建议", bug: "🐞 Bug", game: "🎲 新游戏" };
  return (
    <main className="hall2 fb-admin">
      <h1>反馈（{items?.length ?? 0}）</h1>
      {err && <p className="fb-err">{err}</p>}
      {items?.length === 0 && <p>还没有反馈。</p>}
      {items?.map((f) => (
        <article key={f.id}>
          <header>
            <b>{label[f.type]}</b>
            {f.game && <span>{f.game}</span>}
            <time>{new Date(f.at).toLocaleString("zh-CN")}</time>
          </header>
          <p>{f.text}</p>
          {f.contact && <small>来自：{f.contact}</small>}
        </article>
      ))}
    </main>
  );
}
