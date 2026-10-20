import type { Page } from "playwright";
import type { CreateOptions } from "../packages/shared/src/types.ts";
export async function configurePhoneSetup(p: Page, o: CreateOptions) {
  await p.locator(`[data-map-choice="${o.mapId}"]`).tap();
  await p.getByTestId("setup-next").tap();
  await p.getByTestId("clear-survivors").tap();
  for (const id of o.survivors)
    await p.locator(`[data-character-choice="${id}"]`).tap();
  await p.getByTestId("setup-next").tap();
  await p.locator(`[data-character-choice="${o.killer}"]`).tap();
  await p.getByTestId("setup-next").tap();
  await p.locator('[data-player-count="5"]').tap();
  await p.getByTestId("setup-next").tap();
  if (await p.getByTestId("seed-input").count())
    await p.getByTestId("seed-input").fill(String(o.seed));
}
