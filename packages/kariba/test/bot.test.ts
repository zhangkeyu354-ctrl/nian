import { expect, it } from "vitest";
import { KBRoom } from "../../../apps/server/src/kb-rooms.ts";
import { chooseKaribaPlay, karibaBotView } from "../src/bot.ts";

it("runs 50 full seeded practice games, replaying the normal room commands", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const room = new KBRoom({
      game: "kariba", code: "TEST", createdAt: "", stage: "lobby", hostId: null,
      players: [], mode: "solo", seconds: 0, round: 0, seed: 0, startedAt: 0, lineup: [], commands: [],
    });
    const token = room.claim("练习玩家");
    room.lobby(token, { type: "ADD_BOT", level: seed % 2 ? "easy" : "normal" });
    room.lobby(token, { type: "START" }, 0);
    room.file.seed = seed;
    const game = new KBRoom(room.file);
    for (let n = 1; n <= 600 && game.state?.phase === "PLAY"; n++) {
      const seat = game.state.turn;
      if (!game.botTick(n)) {
        const cards = chooseKaribaPlay(karibaBotView(game.state, seat), "normal", () => 0.5);
        game.apply(token, { type: "PLAY", cardIds: cards, version: game.file.commands.length }, n);
      }
    }
    expect(game.state?.phase).toBe("FINISHED");
    expect(new KBRoom(game.file).state).toEqual(game.state);
  }
});

it("does not receive an opponent hand or the draw order", () => {
  const state = new KBRoom({
    game: "kariba", code: "TEST", createdAt: "", stage: "game", hostId: "p1",
    players: [{playerId: "p1", token: "one", name: "一"}, {playerId: "p2", token: "two", name: "二"}],
    mode: "solo", seconds: 0, round: 1, seed: 51, startedAt: 0, lineup: ["p1", "p2"], commands: [],
  }).state!;
  const view = karibaBotView(state, 0);
  [state.players[1].hand[0], state.deck[0]] = [state.deck[0], state.players[1].hand[0]];
  state.deck.reverse();
  expect(karibaBotView(state, 0)).toEqual(view);
  expect(Object.keys(view).sort()).toEqual(["hand", "pond"]);
});
