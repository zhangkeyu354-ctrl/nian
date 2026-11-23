import React, { useEffect, useState } from "react";

/** 房主移出玩家：点一次变成「确认移出？」，3 秒内再点才真正移出，避免误触。 */
export function KickButton({
  name,
  onKick,
  className = "",
}: {
  name: string;
  onKick: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={"kick-btn " + (armed ? "is-armed " : "") + className}
      aria-label={armed ? "确认移出 " + name : "移出 " + name}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onKick();
        } else setArmed(true);
      }}
    >
      {armed ? "确认移出？" : "移出"}
    </button>
  );
}

/** 房主专用：列出房间里其他玩家，每人一个「移出」按钮（用于座位本身是按钮、不方便放移出键的游戏）。 */
export function HostKickList({
  players,
  me,
  onKick,
  className = "",
}: {
  players: { id: string; name: string }[];
  me: string | null | undefined;
  onKick: (id: string) => void;
  className?: string;
}) {
  const others = players.filter((p) => p.id !== me);
  if (!others.length) return null;
  return (
    <details className={"host-kick-list " + className}>
      <summary>移出玩家（{others.length}）</summary>
      <ul>
        {others.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <KickButton name={p.name} onKick={() => onKick(p.id)} />
          </li>
        ))}
      </ul>
    </details>
  );
}
