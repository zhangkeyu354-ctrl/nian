import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * 建议 / Bug 反馈。
 * - 每条存到 FEEDBACK_FILE（JSON lines）。注意 Render 免费版重启/部署会清空本地文件。
 * - 若配置了 FEEDBACK_GITHUB_TOKEN + FEEDBACK_GITHUB_REPO（owner/repo，建议私有仓库），同时建一个 GitHub Issue 永久保存。
 * - 管理员查看：GET /api/feedback?key=FEEDBACK_KEY
 */
export interface Feedback {
  id: string;
  at: string;
  type: "idea" | "bug" | "game";
  game: string;
  text: string;
  contact: string;
  page: string;
  ua: string;
}

const TYPES = { idea: "建议", bug: "Bug", game: "想玩的新游戏" } as const;

export function createFeedback(file: string) {
  const list: Feedback[] = [];
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split("\n"))
      try {
        if (line.trim()) list.push(JSON.parse(line));
      } catch {}
  const hits = new Map<string, number[]>();

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((ok, bad) => {
      let s = "";
      req.on("data", (c) => {
        s += c;
        if (s.length > 8000) {
          bad(new Error("内容太长"));
          req.destroy();
        }
      });
      req.on("end", () => ok(s));
      req.on("error", bad);
    });

  async function forward(f: Feedback) {
    const token = process.env.FEEDBACK_GITHUB_TOKEN;
    const repo = process.env.FEEDBACK_GITHUB_REPO;
    if (!token || !repo) return;
    const title = `[${TYPES[f.type]}]${f.game ? `[${f.game}]` : ""} ${f.text.replace(/\s+/g, " ").slice(0, 40)}`;
    const body = `${f.text}\n\n---\n- 类型：${TYPES[f.type]}\n- 游戏：${f.game || "（未选）"}\n- 联系方式：${f.contact || "（未填）"}\n- 页面：${f.page}\n- 时间：${f.at}\n- 设备：${f.ua}`;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "zailai-yiju" },
        body: JSON.stringify({ title, body }),
      });
      if (!r.ok) console.warn("反馈转发失败", r.status, (await r.text()).slice(0, 200));
    } catch (e) {
      console.warn("反馈转发失败", e);
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (req.method === "GET") {
      const key = process.env.FEEDBACK_KEY;
      if (!key || url.searchParams.get("key") !== key) {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, error: "无权查看" }));
        return;
      }
      res.end(JSON.stringify({ ok: true, items: [...list].reverse() }));
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("{}");
      return;
    }
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
    if (recent.length >= 5) {
      res.statusCode = 429;
      res.end(JSON.stringify({ ok: false, error: "提交太频繁，过几分钟再试" }));
      return;
    }
    try {
      const d = JSON.parse(await readBody(req));
      const type = d.type in TYPES ? d.type : "idea";
      const text = String(d.text ?? "").trim().slice(0, 1000);
      if (text.length < 2) throw Error("请写一点内容");
      const f: Feedback = {
        id: now.toString(36) + Math.random().toString(36).slice(2, 6),
        at: new Date(now).toISOString(),
        type,
        game: String(d.game ?? "").slice(0, 30),
        text,
        contact: String(d.contact ?? "").trim().slice(0, 60),
        page: String(d.page ?? "").slice(0, 200),
        ua: String(req.headers["user-agent"] ?? "").slice(0, 160),
      };
      list.push(f);
      if (list.length > 2000) list.splice(0, list.length - 2000);
      recent.push(now);
      hits.set(ip, recent);
      try {
        mkdirSync(dirname(file), { recursive: true });
        appendFileSync(file, JSON.stringify(f) + "\n");
      } catch {}
      console.log("[feedback]", JSON.stringify(f));
      void forward(f);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "提交失败" }));
    }
  }
  return { handle, list };
}
