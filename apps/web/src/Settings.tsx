import React, { createContext, useContext, useEffect, useState } from "react";
type Settings = { animations: boolean; art: boolean };
const Context = createContext({
  animations: true,
  art: true,
  effectiveAnimations: true,
  set: (_k: keyof Settings, _v: boolean) => {},
});
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return {
        animations: true,
        art: true,
        ...JSON.parse(localStorage.getItem("dbd-visual-settings") ?? "{}"),
      };
    } catch {
      return { animations: true, art: true };
    }
  });
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)"),
      f = () => setReduced(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  const effectiveAnimations = settings.animations && !reduced;
  useEffect(() => {
    document.documentElement.dataset.motion = effectiveAnimations
      ? "on"
      : "off";
    localStorage.setItem("dbd-visual-settings", JSON.stringify(settings));
  }, [settings, effectiveAnimations]);
  return (
    <Context
      value={{
        ...settings,
        effectiveAnimations,
        set: (k, v) => setSettings((s) => ({ ...s, [k]: v })),
      }}
    >
      {children}
    </Context>
  );
}
export const useSettings = () => useContext(Context);
export function SettingsButton() {
  const s = useSettings(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="settings" onClick={() => setOpen(true)}>
        设置
      </button>
      {open && (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="界面设置"
        >
          <section>
            <h2>界面设置</h2>
            <label>
              <input
                data-testid="animations-setting"
                type="checkbox"
                checked={s.animations}
                onChange={(e) => s.set("animations", e.target.checked)}
              />
              启用动画
            </label>
            <label>
              <input
                data-testid="art-setting"
                type="checkbox"
                checked={s.art}
                onChange={(e) => s.set("art", e.target.checked)}
              />
              使用PNG美术
            </label>
            <p className="muted">
              设置保存在本设备。关闭动画仍显示静态结果，系统减少动态效果设置优先。
            </p>
            <a href="/?view=props" target="_blank" rel="noreferrer">
              查看道具状态一览 ↗
            </a>
            <button onClick={() => setOpen(false)} data-testid="close-settings">
              完成
            </button>
          </section>
        </div>
      )}
    </>
  );
}
