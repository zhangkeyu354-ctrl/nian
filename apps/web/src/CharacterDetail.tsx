import { chars, boardPerks } from "../../../packages/game-engine/src/data.ts";

/** 角色资料：选角时与对局中查看用。全部文字来自 game-data（中文版人物板），不在界面里另写规则。 */
export function characterInfo(id: string) {
  const c = chars.characters.find((x) => x.id === id) as any;
  if (!c) return null;
  return {
    name: c.name_zh as string,
    side: c.side as "survivor" | "killer",
    subtitle: (c.subtitle_zh as string | null) ?? null,
    difficulty: (c.difficulty_zh as string | null) ?? null,
    blood: c.bp_initial as number | undefined,
    bloodMax: c.bp_max as number | undefined,
    power: c.power
      ? { name: c.power.name_zh as string, text: c.power.text_original_zh as string }
      : null,
    passive: c.passive?.text_original_zh ? (c.passive.text_original_zh as string) : null,
    perks: (c.starting_perks as string[]).map((pid) => {
      const p = boardPerks.get(pid) as any;
      return {
        id: pid,
        name: p?.name_zh as string,
        cost: p?.bloodpoint_cost as number,
        text: p?.text_original_zh as string,
      };
    }),
  };
}

export function CharacterDetail({ id }: { id: string }) {
  const c = characterInfo(id);
  if (!c) return null;
  return (
    <article className="character-detail" data-testid={"character-detail-" + id}>
      <header>
        <strong>{c.name}</strong>
        <small>
          {[c.subtitle, c.difficulty && "难度：" + c.difficulty]
            .filter(Boolean)
            .join(" · ")}
        </small>
        {c.blood !== undefined && (
          <small>
            初始血点 {c.blood} · 上限 {c.bloodMax}
          </small>
        )}
      </header>
      {c.power && (
        <section className="cd-power">
          <h4>力量 · {c.power.name}</h4>
          <p>{c.power.text}</p>
        </section>
      )}
      {c.passive && (
        <section className="cd-power">
          <h4>被动</h4>
          <p>{c.passive}</p>
        </section>
      )}
      {c.perks.map((p) => (
        <section key={p.id}>
          <h4>
            {p.name} <span>{p.cost} 血点</span>
          </h4>
          <p>{p.text}</p>
        </section>
      ))}
    </article>
  );
}
