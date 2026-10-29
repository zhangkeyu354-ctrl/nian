import { useEffect } from "react";
import {
  RACER_BY_ID,
  type MAView,
} from "../../../../packages/magical-athlete/src/index.ts";
import { racerArtId } from "../../../../packages/magical-athlete/src/second-wind-preview.ts";
import coords from "../../public/assets/magical-athlete/boards/coordinates.json" with { type: "json" };

type Decodable = {
  src: string;
  decode?: () => Promise<void>;
  addEventListener?: (
    type: string,
    listener: () => void,
    options?: { once: boolean },
  ) => void;
};
export function createArtCache(
  make: () => Decodable = () => new Image(),
  limit = 36,
) {
  const entries = new Map<string, Promise<boolean>>();
  const images = new Map<string, Decodable>();
  return {
    prepare(src: string): Promise<boolean> {
      const existing = entries.get(src);
      if (existing) {
        entries.delete(src);
        entries.set(src, existing);
        return existing;
      }
      const image = make();
      images.set(src, image);
      let decoded: Promise<void>;
      if (image.decode) {
        image.src = src;
        decoded = image.decode();
      } else {
        decoded = new Promise((resolve, reject) => {
          if (!image.addEventListener) {
            reject(new Error("Image events unavailable"));
            return;
          }
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener(
            "error",
            () => reject(new Error("Image unavailable")),
            { once: true },
          );
          image.src = src;
        });
      }
      const ready: Promise<boolean> = decoded.then(
        () => true,
        () => {
          if (entries.get(src) === ready) {
            entries.delete(src);
            images.delete(src);
          }
          return false;
        },
      );
      entries.set(src, ready);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value!;
        entries.delete(oldest);
        images.delete(oldest);
      }
      return ready;
    },
    size: () => entries.size,
  };
}
const art = createArtCache();

/** Prepare only visible racers/current player's cards, not the full expansion. */
export function usePreparedArt(view: MAView, me: string | null) {
  const ids = [
    ...new Set([
      ...(view.race?.tokens.flatMap((t) => [racerArtId(t), t.base]) ?? []),
      ...(view.players.find((p) => p.id === me)?.hand ?? []),
    ]),
  ].filter((id) => RACER_BY_ID.has(id) || id === "sw_bite_mark_were");
  const index = view.race ? view.race.index + (view.race.over ? 1 : 0) : 0;
  const tracks = [
    ...new Set(
      [view.race?.track, view.settings.schedule[index]].filter(Boolean),
    ),
  ];
  const boards = coords.boards.filter((board) =>
    tracks.includes(board.id as "mild" | "wild"),
  );
  const key = ids.join(",") + ":" + tracks.join(",");
  useEffect(() => {
    let cancelled = false;
    const tasks = [
      ...boards.flatMap((board) =>
        [board.assets.webp, board.assets.mobile].map(
          (path) => `/assets/magical-athlete/${path}`,
        ),
      ),
      ...ids.map((id) => `/assets/magical-athlete/tokens/${id}.png`),
      ...ids.map((id) => `/assets/magical-athlete/portraits/${id}.webp`),
      ...ids.map((id) => `/assets/magical-athlete/cards/zh/${id}.webp`),
    ];
    // Two concurrent decodes avoid a burst on slower phones. Never block the queue.
    const worker = async () => {
      while (!cancelled && tasks.length) await art.prepare(tasks.shift()!);
    };
    void worker();
    void worker();
    return () => {
      cancelled = true;
    };
    // IDs are the dependency, not every position/event update.
  }, [key]);
}
