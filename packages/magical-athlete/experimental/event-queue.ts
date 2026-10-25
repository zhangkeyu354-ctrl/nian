/**
 * Research prototype only. Not imported by the live engine, room server, or client.
 * Handlers are trusted server code, not client-supplied effects. Persistence and
 * authenticated routing must be supplied by the future room adapter.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
export interface QueueEvent { id: string; kind: string; payload: JsonObject; causeId: string | null }
export interface QueueDecision { id: string; eventId: string; racerId: string; options: string[] }
export interface QueueState<M> {
  schema: "ma-queue-prototype-v1";
  model: M;
  version: number;
  queue: QueueEvent[];
  completed: string[];
  pending: QueueDecision | null;
  pendingAnswer: { eventId: string; value: string } | null;
  answers: Record<string, string>;
  receipts: Record<string, string>;
}
export type QueueHandler<M> = (model: M, event: QueueEvent, answer?: string) => {
  model: M;
  followUps?: QueueEvent[];
  decision?: QueueDecision;
};
type Request = { id: string; expectedVersion: number } & (
  | { type: "PUMP" } // Internal server job only. Never a public client command.
  | { type: "ANSWER"; player: string; decisionId: string; value: string }
);
type Controller<M> = (model: M, racerId: string) => string | null;
function reject(code: string): never { throw new Error(code); }
const put = (record: Record<string, string>, key: string, value: string) =>
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
const ownValue = (record: Record<string, string>, key: string) => Object.hasOwn(record, key) ? record[key] : undefined;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function uniqueEvents(events: QueueEvent[], completed: string[]) {
  const ids = new Set(completed);
  for (const e of events) {
    if (!e.id || ids.has(e.id)) reject("DUPLICATE_EVENT");
    ids.add(e.id);
  }
}
export function createQueue<M extends JsonObject>(model: M, events: QueueEvent[]): QueueState<M> {
  uniqueEvents(events, []);
  return structuredClone({ schema: "ma-queue-prototype-v1", model, version: 0, queue: events, completed: [], pending: null, pendingAnswer: null, answers: {}, receipts: {} });
}

/** One atomic request. Throws without mutating input if a handler fails.
 * Waiting does not commit the handler's proposed model or children: upon an
 * answer the same event runs from its unmodified model exactly once.
 */
export function advanceQueue<M extends JsonObject>(input: QueueState<M>, req: Request, handlers: Record<string, QueueHandler<M>>, controller: Controller<M>): QueueState<M> {
  const fingerprint = canonical(req);
  const receipt = ownValue(input.receipts, req.id);
  if (receipt !== undefined) {
    if (receipt !== fingerprint) reject("REQUEST_ID_CONFLICT");
    return structuredClone(input);
  }
  if (req.expectedVersion !== input.version) reject("STALE");
  const s = structuredClone(input);
  if (req.type === "ANSWER") {
    const pending = s.pending;
    if (!pending || pending.id !== req.decisionId) reject("WRONG_DECISION");
    if (controller(s.model, pending.racerId) !== req.player) reject("NOT_CONTROLLER");
    if (!pending.options.includes(req.value)) reject("BAD_OPTION");
    put(s.answers, pending.id, req.value);
    s.pendingAnswer = { eventId: pending.eventId, value: req.value };
    s.pending = null;
  }
  // A batch budget yields; it never discards events or declares a rules loop.
  for (let work = 0; work < 256 && s.queue.length && !s.pending; work++) {
    const e = s.queue[0];
    const handler = Object.hasOwn(handlers, e.kind) ? handlers[e.kind] : undefined;
    if (!handler) reject("UNKNOWN_EVENT");
    const boundAnswer = s.pendingAnswer?.eventId === e.id ? s.pendingAnswer.value : undefined;
    const result = handler(structuredClone(s.model), structuredClone(e), boundAnswer);
    if (result.decision) {
      if (boundAnswer !== undefined) reject("SPLIT_MULTI_DECISION_EVENT");
      const d = result.decision;
      if (d.eventId !== e.id || !d.id || !d.options.length || new Set(d.options).size !== d.options.length) reject("BAD_DECISION");
      if (Object.hasOwn(s.answers, d.id)) reject("DUPLICATE_DECISION");
      s.pending = structuredClone(d);
      break;
    }
    s.model = result.model;
    s.completed.push(e.id);
    const next = [...(result.followUps ?? []), ...s.queue.slice(1)];
    uniqueEvents(next, s.completed);
    s.queue = next;
    s.pendingAnswer = null;
  }
  s.version++;
  put(s.receipts, req.id, fingerprint);
  return s;
}

/** Queue metadata only; projecting the game's public model is a separate job. */
export function queuePublicView<M>(s: QueueState<M>, viewer: string | null, controller: Controller<M>) {
  return {
    version: s.version,
    status: s.pending ? "waiting" : s.queue.length ? "running" : "idle",
    pending: s.pending ? {
      id: s.pending.id,
      racerId: s.pending.racerId,
      options: viewer !== null && controller(s.model, s.pending.racerId) === viewer ? [...s.pending.options] : [],
    } : null,
  };
}
