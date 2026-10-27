import { chromium } from "playwright";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.env.WT_URL ?? "http://127.0.0.1:3447";
const before = process.env.WT_BEFORE_URL ?? "http://127.0.0.1:3448";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Snapshot setup is local only",
);
const out = "docs/witch-town/validation/screens/mobile-fix-1027/comparison";
mkdirSync(out, { recursive: true });
const call = (s: Socket, event: string, data: any) =>
  new Promise<any>((res, rej) =>
    s
      .timeout(5000)
      .emit(event, data, (e: any, r: any) =>
        e ? rej(e) : r?.ok ? res(r.data) : rej(new Error(r?.error)),
      ),
  );
const rows: any[] = [];
const browser = await chromium.launch();
try {
  for (const n of [4, 12]) {
    const members: any[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const socket = io(base, { transports: ["websocket"] });
        await new Promise<void>((res, rej) => {
          socket.once("connect", res);
          socket.once("connect_error", rej);
        });
        members.push({ socket });
      }
      const code = (await call(members[0].socket, "wt:create", { capacity: n }))
        .code;
      for (const [i, m] of members.entries()) {
        m.name = `玩家${i + 1}`;
        m.claimKey = randomUUID() + randomUUID();
        Object.assign(
          m,
          await call(m.socket, "wt:claim", {
            code,
            name: m.name,
            claimKey: m.claimKey,
          }),
        );
      }
      const act = async (m: any, action: any) => {
        const s = await call(m.socket, "wt:join", { code, token: m.token });
        return call(m.socket, "wt:action", {
          code,
          request: { requestId: randomUUID(), version: s.version, action },
        });
      };
      for (const m of members) await act(m, { type: "READY", ready: true });
      await act(members[0], { type: "START" });
      const all = await call(members[0].socket, "wt:join", {
        code,
        token: members[0].token,
      });
      const target = all.view.players.find(
        (p: any) => !["mary_warren", "martha_corey"].includes(p.character),
      ).id;
      for (const m of members) {
        const s = await call(m.socket, "wt:join", { code, token: m.token });
        if (s.view.phase === "dawn" && s.view.private?.witchAllies)
          await act(m, { type: "DAWN_TARGET", targetId: target });
      }
      const host = members[0];
      for (const [label, url] of [
        ["before", before],
        ["after", base],
      ]) {
        const ctx = await browser.newContext({
          viewport: { width: n === 4 ? 390 : 375, height: n === 4 ? 844 : 667 },
          hasTouch: true,
          isMobile: true,
        });
        await ctx.addInitScript(
          ({ code, saved }) =>
            localStorage.setItem(`wt-seat-${code}`, JSON.stringify(saved)),
          {
            code,
            saved: {
              name: host.name,
              claimKey: host.claimKey,
              token: host.token,
              playerId: host.playerId,
            },
          },
        );
        const p = await ctx.newPage();
        await p.goto(`${url}/?game=wt&room=${code}`);
        await p.waitForSelector("[data-phase=day]");
        await p.waitForTimeout(2500);
        const stats = await p.evaluate(() => {
          const els = [
            ...document.querySelectorAll<HTMLElement>(
              ".wt-seat,.wt-seat-public,.wt-accuse-row",
            ),
          ].filter((e) => e.getBoundingClientRect().width > 0);
          const clipped = els
            .filter(
              (e) =>
                e.scrollHeight > e.clientHeight ||
                e.scrollWidth > e.clientWidth,
            )
            .map((e) => ({
              class: e.className,
              client: [e.clientWidth, e.clientHeight],
              scroll: [e.scrollWidth, e.scrollHeight],
            }));
          const seats = [
            ...document.querySelectorAll<HTMLElement>(
              ".wt-table-space .wt-seat",
            ),
          ];
          const overlap: string[] = [];
          for (let i = 0; i < seats.length; i++)
            for (let j = i + 1; j < seats.length; j++) {
              const a = seats[i],
                b = seats[j];
              if (
                Math.abs(a.offsetLeft - b.offsetLeft) <
                  (a.offsetWidth + b.offsetWidth) / 2 &&
                Math.abs(a.offsetTop - b.offsetTop) <
                  (a.offsetHeight + b.offsetHeight) / 2
              )
                overlap.push(`${i + 1}/${j + 1}`);
            }
          return {
            clipped,
            overlap,
            seatHeights: seats.map((s) => s.offsetHeight),
            blueIcons: seats.map(
              (s) =>
                s.querySelectorAll(".wt-seat-public .wt-effect-token").length,
            ),
          };
        });
        await p.screenshot({ path: `${out}/${label}-${n}p.png` });
        rows.push({ label, players: n, ...stats });
        await ctx.close();
        if (label === "after") {
          assert.equal(stats.clipped.length, 0);
          assert.equal(stats.overlap.length, 0);
          assert(stats.seatHeights.every((h) => h >= (n >= 9 ? 54 : 74)));
          assert(stats.blueIcons.every((k) => k <= 2));
        }
      }
    } finally {
      members.forEach((m) => m.socket.disconnect());
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/comparison.json`, JSON.stringify(rows, null, 2));
}
console.log(
  JSON.stringify(
    rows.map((r) => ({
      label: r.label,
      players: r.players,
      clipped: r.clipped.length,
      overlap: r.overlap.length,
      seatHeights: r.seatHeights,
    })),
  ),
);
