import { useEffect, useRef } from "react";
import { useSettings } from "./Settings.tsx";

// Presentation-only browser affordances. Never submit commands or cache state.
export function usePhoneExperience(
  inGame: boolean,
  myTurn: boolean,
  actor: string | null,
) {
  const settings = useSettings();
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef("");
  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => {});
      } catch {
        /* browser unavailable */
      }
    };
    window.addEventListener("pointerup", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerup", unlock);
      void audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const key = myTurn ? (actor ?? "") : "",
      fresh = key && key !== previous.current;
    previous.current = key;
    if (!fresh) return;
    if (settings.vibration && navigator.userActivation?.hasBeenActive)
      navigator.vibrate?.(60);
    if (settings.sound && audio.current?.state === "running") {
      const ctx = audio.current,
        tone = ctx.createOscillator(),
        gain = ctx.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(620, ctx.currentTime);
      tone.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.055, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      tone.connect(gain).connect(ctx.destination);
      tone.start();
      tone.stop(ctx.currentTime + 0.21);
    }
  }, [myTurn, actor, settings.sound, settings.vibration]);
  useEffect(() => {
    const title = document.title;
    if (!myTurn) return;
    const timer = setInterval(() => {
      document.title = document.title === title ? "轮到你了 · 黎明杀机" : title;
    }, 1800);
    return () => {
      clearInterval(timer);
      document.title = title;
    };
  }, [myTurn]);
  useEffect(() => {
    if (!inGame || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | null = null,
      disposed = false;
    async function acquire() {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        (lock && !lock.released)
      )
        return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) await next.release();
        else lock = next;
      } catch {
        /* HTTP/low battery/unsupported: game remains playable */
      }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [inGame]);
}
