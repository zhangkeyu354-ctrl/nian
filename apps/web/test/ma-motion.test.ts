import { afterEach, expect, it, vi } from "vitest";
import {
  motionMs,
  setSpeed,
  installMotionClock,
} from "../src/ma/motion-clock.ts";
import { createArtCache } from "../src/ma/art-cache.ts";

afterEach(() => vi.unstubAllGlobals());

it("playback waits and decorative durations share the existing three speeds and reduced motion", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key),
    setItem: (key: string, value: string) => data.set(key, value),
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  for (const [speed, factor] of [
    ["normal", 1],
    ["slow", 1.5],
    ["fast", 0.5],
  ] as const) {
    setSpeed(speed);
    expect(motionMs(480)).toBe(480 * factor);
    expect(motionMs(2600)).toBe(2600 * factor);
    expect(motionMs(2250, 0.8)).toBe(2250 * 0.8 * factor);
  }
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  expect(motionMs(2600)).toBe(0);
});

it("art is decoded before ready, duplicate requests share work, failures can retry", async () => {
  const decode = vi.fn<() => Promise<void>>();
  let done!: () => void;
  decode.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  decode.mockRejectedValueOnce(new Error("unavailable"));
  decode.mockResolvedValue(undefined);
  const make = vi.fn(() => ({ src: "", decode }));
  const cache = createArtCache(make, 2);
  const first = cache.prepare("a");
  expect(cache.prepare("a")).toBe(first);
  let ready = false;
  void first.then(() => {
    ready = true;
  });
  await Promise.resolve();
  expect(ready).toBe(false);
  done();
  expect(await first).toBe(true);
  expect(await cache.prepare("b")).toBe(false);
  expect(await cache.prepare("b")).toBe(true);
  expect(make).toHaveBeenCalledTimes(3);
  await cache.prepare("c");
  expect(cache.size()).toBeLessThanOrEqual(2);
});

it("an evicted image's late failure cannot remove the replacement request", async () => {
  let reject!: (error: Error) => void;
  const decode = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  const cache = createArtCache(() => ({ src: "", decode }), 1);
  const old = cache.prepare("a");
  await cache.prepare("b");
  const replacement = cache.prepare("a");
  reject(new Error("old request failed"));
  await old;
  expect(cache.prepare("a")).toBe(replacement);
});

it("local speed and system reduced-motion update CSS without a React render; disposal unsubscribes", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("matchMedia", () => media);
  const properties = new Map<string, string>();
  const write = vi.fn((key: string, value: string) =>
    properties.set(key, value),
  );
  const off = installMotionClock({
    style: { setProperty: write },
  } as unknown as HTMLElement);
  setSpeed("fast");
  expect(properties.get("--ma-step-ms")).toBe("240ms");
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  expect(properties.get("--ma-step-ms")).toBe("0ms");
  off();
  write.mockClear();
  setSpeed("slow");
  expect(write).not.toHaveBeenCalled();
});

it("image preparation falls back to load events when decode is unavailable", async () => {
  const events = new Map<string, () => void>();
  const cache = createArtCache(() => ({
    src: "",
    addEventListener: (type: string, fn: () => void) => {
      events.set(type, fn);
    },
  }));
  const ready = cache.prepare("legacy");
  events.get("load")!();
  expect(await ready).toBe(true);
});
