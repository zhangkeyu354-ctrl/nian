const PALETTES: Record<string, string[]> = {
  "#e8443a": ["#ff77be", "#ffb8d9", "#ffd45a"],
  "#2f7fd8": ["#65ddff", "#ffe77d", "#b8f4ff"],
  "#f2b705": ["#ff963c", "#fff0a3", "#ffd957"],
  "#8a4fd6": ["#f786d7", "#c9a5ff", "#ffb8eb"],
  "#1fa37a": ["#88ed9c", "#d9ee87", "#a8ffcc"],
  "#f07c1e": ["#ffe087", "#fff0b0", "#ffb248"],
  "#e05aa8": ["#d1a2ff", "#fff0a3", "#ffbfe4"],
  "#20b2c8": ["#a2edc0", "#ffe68b", "#b7f4ff"],
};
export function dicePaintColors(base: string) {
  return PALETTES[base] ?? PALETTES["#2f7fd8"];
}
