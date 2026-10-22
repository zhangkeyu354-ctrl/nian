import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { attachWitchTown } from "../apps/server/src/wt-rooms.ts";
import type { WTState } from "../packages/witch-town/src/index.ts";
import { effectiveCharacter } from "../packages/witch-town/src/day.ts";
import { auditWTUpdate } from "./wt-privacy-audit.ts";
const out = resolve("output/witch-town/privacy");
mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), "wt-wire-audit-")),
  http = createServer(),
  server = new Server(http),
  store = attachWitchTown(server, dir, { allowCandidateCounts: true });
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(http.address() as any).port}`;
const rows: any[] = [];
const originalNow = Date.now;
let offset = 0;
Date.now = () => originalNow() + offset;
const ack = (s: Socket, event: string, data: any) =>
  new Promise<any>((res, rej) =>
    s
      .timeout(5000)
      .emit(event, data, (e: any, r: any) =>
        e ? rej(e) : r?.ok ? res(r.data) : rej(new Error(r?.error)),
      ),
  );
try {
  for (const n of [4, 8, 12]) {
    const sockets: Socket[] = [];
    const ids: string[] = [];
    const records: any[] = [];
    const versions = new Map<number, WTState | null>();
    let code = "",
      serial = 0,
      commands = 0;
    const phases = new Set<string>(),
      choices = new Set<string>();
    const trace = join(out, `${n}p-wire.ndjson`);
    writeFileSync(trace, "");
    const read = () =>
      JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
    const remember = () => {
      const r = read();
      versions.set(r.version, r.state);
      return r.state as WTState;
    };
    const receive = (seat: number, payload: any, source: string) => {
      if (!code) return;
      const r = read();
      if (r.version === payload.version) versions.set(r.version, r.state);
      const row = { seat, source, version: payload.version, payload };
      records.push(row);
      appendFileSync(trace, JSON.stringify(row) + "\n");
      if (payload.view) {
        phases.add(payload.view.phase);
        if (payload.view.private?.choice)
          choices.add(payload.view.private.choice.kind);
      }
    };
    async function connect(seat: number) {
      const s = io(url, { transports: ["websocket"], reconnection: false });
      await new Promise<void>((r, j) => {
        s.once("connect", r);
        s.once("connect_error", j);
      });
      s.on("wt:update", (p) => receive(seat, p, "wt:update"));
      sockets.push(s);
      return s;
    }
    const host = await connect(0);
    code = (await ack(host, "wt:create", { capacity: n })).code;
    remember();
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? host : await connect(i);
      const c = await ack(s, "wt:claim", {
        code,
        name: `审计${i + 1}`,
        claimKey: `audit_${n}_${i}_` + "x".repeat(40),
      });
      ids.push(c.playerId);
      remember();
      receive(i, c.snapshot, "claimAck");
    }
    const observer = await connect(n);
    const obs = await ack(observer, "wt:join", { code, token: null });
    receive(n, obs, "joinAck");
    async function action(id: string, command: any) {
      const before = read();
      const snap = await ack(sockets[ids.indexOf(id)], "wt:action", {
        code,
        request: {
          requestId: `audit${serial++}`,
          version: before.version,
          action: command,
        },
      });
      remember();
      receive(ids.indexOf(id), snap, "actionAck");
      commands++;
      await new Promise((r) => setTimeout(r, 2));
    }
    try {
      for (const id of ids) await action(id, { type: "READY", ready: true });
      await action(ids[0], { type: "START" });
      let s = remember();
      const target =
        s.players.find(
          (p) => !["mary_warren", "martha_corey"].includes(p.character),
        )?.id ?? ids[0];
      for (const p of s.players.filter((p) => p.everWitch))
        await action(p.id, { type: "DAWN_TARGET", targetId: target });
      for (let step = 0; step < 2500; step++) {
        s = remember();
        assert(!s.checkRequired, s.checkRequired ?? "");
        if (s.phase === "over") break;
        const p = s.pending;
        if (p?.kind === "loot") {
          await action(p.playerId, { type: "LOOT_PICK", cardId: p.pool[0].id });
          continue;
        }
        if (p?.kind === "tituba") {
          await action(p.playerId, {
            type: "TITUBA_REORDER",
            cardIds: s.deck.map((c) => c.id),
          });
          await action(p.playerId, { type: "TITUBA_FINISH", action: "draw" });
          continue;
        }
        if (p?.kind === "ability") {
          await action(p.playerId, { type: "ABILITY_DECISION", use: false });
          continue;
        }
        if (p?.kind === "trial") {
          await action(p.actorId, { type: "REVEAL_TRYAL", index: 0 });
          continue;
        }
        if (p?.kind === "black-event") {
          const e = p.event!;
          if (e.type === "conspiracy") {
            if (e.stage === "cat")
              await action(p.drawerId, { type: "CONSPIRACY_REVEAL", index: 0 });
            else {
              const id = e.members.find((id) => !e.picks[id]);
              assert(id);
              await action(id, { type: "CONSPIRACY_PICK", index: 0 });
            }
          } else if (e.stage === "witches") {
            const witch = s.players.find(
              (q) => q.alive && q.everWitch && !e.votes[q.id],
            );
            assert(witch);
            const target =
              Object.values(e.votes)[0] ??
              s.players.find((q) => q.alive && !q.everWitch)?.id ??
              s.players.find((q) => q.alive)!.id;
            await action(witch.id, { type: "NIGHT_TARGET", targetId: target });
          } else if (e.stage === "constable") {
            const c = s.players.find(
              (q) =>
                q.alive &&
                q.tryals.some((t) => !t.revealed && t.kind === "constable"),
            );
            assert(c);
            await action(c.id, {
              type: "NIGHT_PROTECT",
              targetId: s.players.find((q) => q.alive && q.id !== c.id)!.id,
            });
          } else {
            // Advance only this isolated test process's clock. Production deadlines are unchanged.
            offset += 31000;
            await new Promise((r) => setTimeout(r, 300));
            remember();
          }
          continue;
        }
        assert.equal(s.phase, "day");
        const actor = s.players.find((q) => q.id === s.turnPlayerId)!;
        if (s.day.played) {
          await action(actor.id, { type: "END_TURN" });
          continue;
        }
        if (
          effectiveCharacter(s, actor.id) === "tituba" &&
          !actor.abilityUses.tituba
        ) {
          await action(actor.id, { type: "TITUBA_START" });
          continue;
        }
        // After a full deck cycle use red cards to make the run finish; the oracle is
        // a test driver, never sent to any seat. No engine command or card is fabricated.
        const red = actor.hand.find((c) =>
          ["accusation", "evidence", "witness"].includes(c.kind),
        );
        if (red && s.log.some((e) => e.type === "NIGHT_COMPLETE")) {
          const t =
            s.players.find(
              (q) =>
                q.alive &&
                q.id !== actor.id &&
                q.tryals.some((t) => !t.revealed && t.kind === "witch"),
            ) ?? s.players.find((q) => q.alive && q.id !== actor.id);
          if (t) {
            await action(actor.id, {
              type: "PLAY",
              cardId: red.id,
              targetId: t.id,
            });
            continue;
          }
        }
        await action(actor.id, { type: "DRAW" });
      }
      s = remember();
      assert.equal(s.phase, "over", "step limit reached");
      await new Promise((r) => setTimeout(r, 60));
      const checked = Array.from({ length: n + 1 }, () => ({
        updates: 0,
        acks: 0,
        preEnd: 0,
      }));
      for (const r of records) {
        assert(versions.has(r.version), `missing oracle v${r.version}`);
        auditWTUpdate(
          r.payload,
          r.seat === n ? null : ids[r.seat],
          versions.get(r.version)!,
        );
        checked[r.seat][r.source === "wt:update" ? "updates" : "acks"]++;
        if (r.payload.view?.phase !== "over") checked[r.seat].preEnd++;
      }
      assert(checked.every((x) => x.updates > 0 && x.preEnd > 0));
      const row = {
        players: n,
        finished: true,
        commands,
        snapshots: records.length,
        perSeat: checked,
        phases: [...phases],
        choices: [...choices],
        violations: 0,
        rawTrace: `output/witch-town/privacy/${n}p-wire.ndjson`,
        sha256: createHash("sha256").update(readFileSync(trace)).digest("hex"),
        clock: "isolated Date.now offset for server timer; no engine edits",
        driver:
          "oracle selects targets for termination; clients receive only authorized snapshots",
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } finally {
      sockets.forEach((s) => s.disconnect());
    }
  }
} finally {
  Date.now = originalNow;
  store.dispose();
  await server.close();
  http.close();
  mkdirSync("docs/witch-town/validation", { recursive: true });
  writeFileSync(
    "docs/witch-town/validation/privacy-audit.json",
    JSON.stringify(
      {
        runs: rows,
        rawTracesCommitted: false,
        scope:
          "All wt:update frames plus ACK snapshots, 4/8/12 complete protocol games with independent allow-list and per-version oracle. Witches may see allied votes; other seats may not. Authorized Tituba/loot data scoped to their actors.",
      },
      null,
      2,
    ) + "\n",
  );
}
assert.equal(rows.length, 3);
