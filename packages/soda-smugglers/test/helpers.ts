import {
  createSS,
  reduceSS,
  bottlesSS,
  assertInvariants,
  type SSState,
  type Command,
} from "../src/index.ts";
export const game = (n = 3, seed = 1, events = false) =>
  createSS(
    Array.from({ length: n }, (_, i) => `旅客${i}`),
    { seed, firstGuard: 0, events, now: 1000 },
  );
export function act(
  s: SSState,
  body: Record<string, unknown>,
  actor: number | "server" = s.guard,
  now = 1000,
) {
  return reduceSS(s, {
    ...body,
    actor,
    seq: (s.seq[String(actor)] ?? 0) + 1,
    now,
  } as Command);
}
export function pack(s: SSState) {
  for (let i = 0; i < s.players.length; i++)
    if (i !== s.guard && !s.players[i].submitted) {
      const h = s.players[i].hand;
      const n = s.event === "holiday" ? 3 : 2;
      s = act(s, { type: "SUBMIT", luggage: h.slice(0, n), bribe: h[n] }, i);
    }
  return s;
}
export function withHands(s: SSState, hands: number[][]) {
  const deck = [
    ...s.deck,
    ...s.discard,
    ...s.players.flatMap((p) => [
      ...p.hand,
      ...p.luggage,
      ...(p.bribe ? [p.bribe] : []),
    ]),
  ];
  s.discard = [];
  s.players.forEach((p) => {
    p.hand = [];
    p.luggage = [];
    p.bribe = null;
    p.submitted = false;
    p.settled = false;
    p.revealed = [];
  });
  hands.forEach((values, i) =>
    values.forEach((v) => {
      const ix = deck.findIndex((id) => bottlesSS(id) === v);
      if (ix < 0) throw Error("fixture exhausted");
      s.players[i].hand.push(deck.splice(ix, 1)[0]);
    }),
  );
  s.deck = deck;
  assertInvariants(s);
  return s;
}
