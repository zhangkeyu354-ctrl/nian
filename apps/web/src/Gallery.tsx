import React from "react";
import {
  visualCatalog,
  visualKindNames,
  sampleVisual,
} from "../../../packages/game-engine/src/index.ts";
import { chars } from "../../../packages/game-engine/src/data.ts";
import { Token } from "./Token.tsx";
import { SettingsButton } from "./Settings.tsx";
export function Gallery() {
  return (
    <main className="state-gallery">
      <header>
        <div>
          <p className="eyebrow">原创素材 · 引擎状态组件</p>
          <h1>道具状态一览</h1>
          <p className="muted">
            展示样本，不是实际对局。所有状态使用与棋盘相同的组件。
          </p>
        </div>
        <SettingsButton />
        <a href="/?hotseat=1">返回热座</a>
      </header>
      {Object.entries(visualCatalog).map(([kind, states]) => (
        <section key={kind}>
          <h2>{visualKindNames[kind]}</h2>
          <div className="state-grid">
            {Object.entries(states).map(([state, label]) => (
              <figure key={state} data-gallery-state={kind + ":" + state}>
                <Token token={sampleVisual(kind, state)} size={100} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h2>技能检定结果 · 展示样本</h2>
        <div className="state-grid dice-samples">
          {[
            { id: "failure", symbol: "×", label: "失败" },
            { id: "success", symbol: "3", label: "成功" },
            { id: "great", symbol: "★", label: "大成功" },
          ].map((d) => (
            <figure key={d.id} data-result={d.id}>
              <div className={"die " + d.id}>
                <strong>{d.symbol}</strong>
                <span>{d.label}</span>
              </div>
              <figcaption>{d.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section>
        <h2>十三名基础角色 · 原创剪影与中文名</h2>
        <div className="state-grid">
          {chars.characters.map((c) => (
            <figure key={c.id}>
              <Token
                token={{
                  ...sampleVisual("actor", "healthy"),
                  asset: "portrait_" + c.id,
                  label: c.name_zh,
                }}
                size={100}
              />
              <figcaption>{c.name_zh}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
