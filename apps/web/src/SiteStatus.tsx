import { useEffect, useState } from "react";
import { UPDATE_NOTICES } from "./update-notices.ts";

/** 网站状态页：/?view=status —— 现在有几个人在玩、各游戏房间数、线上版本 */
const NAMES: Record<string, string> = {
  rooms: "黎明杀机", maRooms: "魔法运动员", cnRooms: "行动代号", dmRooms: "请留遗言", rkRooms: "拉密",
  ssRooms: "汽水走私犯", duRooms: "反转王牌", skRooms: "骷髅王", rrRooms: "眼疾手快", xbRooms: "瞎掰王",
  dpRooms: "传情画意 / 纽约伪画家", ndRooms: "脑洞量表", kbRooms: "卡里巴湖", bfRooms: "魔王试炼", taRooms: "我们之中的威胁",
};

export function SiteStatus() {
  const [h, setH] = useState<any>(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState("");
  const load = () =>
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setH(d);
        setErr("");
        setAt(new Date().toLocaleTimeString("zh-CN"));
      })
      .catch(() => setErr("连不上网站"));
  useEffect(() => {
    document.title = "网站状态 · 再来一局";
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const rooms = h
    ? Object.entries(NAMES)
        .map(([k, n]) => [n, Number(h[k] ?? 0)] as const)
        .concat([["女巫镇", Number(h.witchTown?.rooms ?? 0)] as const])
        .filter(([, c]) => c > 0)
    : [];
  const online = Number(h?.online ?? 0);
  // 新版服务器有 active（30 分钟内有操作的人数）和 playing（每个有人的房间）；旧版没有时退回 online
  const hasActive = typeof h?.active === "number";
  const active = hasActive ? Number(h.active) : online;
  const playing: Array<{ game: string; players: number; idleMinutes: number }> = h?.playing ?? [];
  const idleText = (m: number) => (m < 1 ? "刚刚有操作" : m < 60 ? `${m} 分钟没操作` : `${Math.floor(m / 60)} 小时 ${m % 60} 分钟没操作`);
  return (
    <main className="hall2 status-page">
      <h1>网站状态</h1>
      {err && <p className="fb-err">{err}</p>}
      {h && (
        <>
          <section className={`status-big ${active ? "busy" : "idle"}`}>
            <b>{active}</b>
            <span>
              {active
                ? "人正在玩（不会自动更新，等他们玩完）"
                : "现在没人在玩（有新版本会在 10 分钟内自动更新）"}
            </span>
          </section>
          {hasActive && (
            <section className="status-card">
              <h2>谁在哪里</h2>
              {playing.length === 0 ? (
                <p>没有人连着游戏</p>
              ) : (
                playing.map((p, i) => (
                  <p key={i}>
                    {p.game}：{p.players} 人在线 · {idleText(p.idleMinutes)}
                    {p.idleMinutes >= 30 ? "（算作挂着没玩）" : ""}
                  </p>
                ))
              )}
              <small>
                共 {online} 个页面连着游戏。30 分钟内有人操作过的房间才算「正在玩」；挂着不动的页面不会挡住自动更新。一个人开两个页面会算 2 个。网站更新重启后，分钟数从重启时开始算。
              </small>
            </section>
          )}
          <section className="status-card">
            <h2>有房间的游戏</h2>
            {rooms.length === 0 ? <p>没有房间</p> : rooms.map(([n, c]) => <p key={n}>{n}：{c} 个房间</p>)}
            <small>房间在没人之后还会保留一段时间，所以房间数不等于在玩的人数。</small>
          </section>
          <section className="status-card">
            <h2>其他</h2>
            <p>线上版本：{h.version}</p>
            <p>图片加载：{h.assetCdn?.ok ? "GitHub Pages（省流量）" : "网站自己提供"}</p>
          </section>
          <section className="status-card">
            <h2>最近的改动（当前线上版本）</h2>
            {UPDATE_NOTICES.slice(0, 6).map((n) => (
              <p key={n.id}>
                <b>{n.date.slice(5)} · {n.game}</b>　{n.title}
              </p>
            ))}
            <small>只列出已经上线的改动；还在等上线的改动要等自动更新后才会出现在这里。完整说明在大厅的更新公告里。</small>
          </section>
          <p className="status-at">每 15 秒自动刷新 · 上次更新 {at}</p>
        </>
      )}
    </main>
  );
}
