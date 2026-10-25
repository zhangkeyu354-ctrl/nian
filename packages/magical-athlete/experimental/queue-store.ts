/** Single-process research adapter. No live room routes import this module. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { advanceQueue, createQueue, queuePublicView, type Json, type QueueEvent, type QueueHandler, type QueueState } from "./event-queue.ts";
type ModelObject = { [key: string]: Json };
type Answer = { type: "ANSWER"; id: string; expectedVersion: number; decisionId: string; value: string };
function bad(code: string): never { throw new Error(code); }
const string = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256;

export class ExperimentalQueueStore<M extends ModelObject> {
  private dir: string;
  constructor(dir: string, private handlers: Record<string, QueueHandler<M>>, private controller: (model: M, racer: string) => string | null) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, { recursive: true });
  }
  private path(id: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) bad("BAD_ROOM_ID");
    return join(this.dir, id + ".json");
  }
  private persist(id: string, state: QueueState<M>) {
    const file = this.path(id);
    // Persist before returning success; an interrupted pre-rename write leaves
    // the old checkpoint authoritative. This is not a multi-process lock or a
    // guarantee against disk/controller power loss or ephemeral-volume deletion.
    writeFileSync(file + ".tmp", JSON.stringify(state), { encoding: "utf8", flush: true });
    renameSync(file + ".tmp", file);
  }
  /** Server-only: never send the returned checkpoint directly to a browser. */
  readPrivate(id: string): QueueState<M> {
    const state = JSON.parse(readFileSync(this.path(id), "utf8")) as QueueState<M>;
    if (state.schema !== "ma-queue-prototype-v1" || !Number.isSafeInteger(state.version) || !Array.isArray(state.queue) || !Array.isArray(state.completed)) bad("CHECKPOINT_SCHEMA");
    return state;
  }
  /** Internal room creation, not an untrusted transport endpoint. */
  create(id: string, model: M, events: QueueEvent[]) {
    if (existsSync(this.path(id))) bad("ALREADY_EXISTS");
    this.persist(id, createQueue(model, events));
  }
  /** Internal server continuation job; no PUMP endpoint is exposed to clients. */
  pump(id: string, request: { id: string; expectedVersion: number }) {
    const next = advanceQueue(this.readPrivate(id), { ...request, type: "PUMP" }, this.handlers, this.controller);
    this.persist(id, next);
    return queuePublicView(next, null, this.controller);
  }
  /** actor must come from the room's authenticated transport, never req.player.
   * This validates the public command surface but does not authenticate sockets.
   */
  answer(id: string, actor: string | null, raw: unknown) {
    if (!actor) bad("NOT_SEATED");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("BAD_REQUEST");
    const req = raw as Record<string, unknown>;
    const keys = ["type", "id", "expectedVersion", "decisionId", "value"];
    if (Object.keys(req).length !== keys.length || Object.keys(req).some(k => !keys.includes(k)) || req.type !== "ANSWER" || !string(req.id) || !string(req.decisionId) || !string(req.value) || !Number.isSafeInteger(req.expectedVersion) || Number(req.expectedVersion) < 0) bad("BAD_REQUEST");
    const typed = req as Answer;
    const next = advanceQueue(this.readPrivate(id), { ...typed, player: actor }, this.handlers, this.controller);
    this.persist(id, next);
    return queuePublicView(next, actor, this.controller);
  }
  view(id: string, viewer: string | null) {
    return queuePublicView(this.readPrivate(id), viewer, this.controller);
  }
}
