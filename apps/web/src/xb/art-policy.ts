export const ART_ROOT = "/assets/xiabaiwang-v4/";
export function studioPolicy(caps: {
  width: number;
  powerSave?: boolean;
  reduced?: boolean;
  saveData?: boolean;
  memory?: number;
  cores?: number;
  portrait?: boolean;
}) {
  const preblurred = !!(
    caps.powerSave ||
    caps.reduced ||
    caps.saveData ||
    (caps.memory && caps.memory <= 4) ||
    (caps.cores && caps.cores <= 4)
  );
  const tier = caps.width > 1000 ? "high" : "low";
  return {
    preblurred,
    liveBlur: !preblurred,
    src: `${ART_ROOT}studio${caps.portrait ? "-portrait" : ""}-${tier}${preblurred ? "-blur" : ""}.webp`,
  };
}
