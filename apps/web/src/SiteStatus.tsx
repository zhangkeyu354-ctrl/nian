import { useEffect, useState } from "react";

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
  return (
    <main className="hall2 status-page">
      <h1>网站状态</h1>
      {err && <p className="fb-err">{err}</p>}
      {h && (
        <>
          <section className={`status-big ${online ? "busy" : "idle"}`}>
            <b>{online}</b>
            <span>{online ? "人正在玩（不会自动更新，等他们下线）" : "现在没人在玩（有新版本会在 10 分钟内自动更新）"}</span>
          </section>
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
          <p className="status-at">每 15 秒自动刷新 · 上次更新 {at}</p>
        </>
      )}
    </main>
  );
}
