export type ColorPreset = {
  name: string;
  hex: string;
};

// Caido keeps traffic-table text white, so these backgrounds are deliberately
// dark enough to preserve contrast in the real traffic table.
export const COLOR_PRESETS: ColorPreset[] = [
  { name: "Crimson", hex: "#991B1B" }, { name: "Red", hex: "#B91C1C" },
  { name: "Rose", hex: "#9F1239" }, { name: "Pink", hex: "#9D174D" },
  { name: "Fuchsia", hex: "#86198F" }, { name: "Purple", hex: "#7E22CE" },
  { name: "Violet", hex: "#6D28D9" }, { name: "Indigo", hex: "#3730A3" },
  { name: "Blue", hex: "#1D4ED8" }, { name: "Royal Blue", hex: "#1E40AF" },
  { name: "Sky", hex: "#0369A1" }, { name: "Cyan", hex: "#0E7490" },
  { name: "Teal", hex: "#0F766E" }, { name: "Emerald", hex: "#047857" },
  { name: "Green", hex: "#15803D" }, { name: "Lime", hex: "#3F6212" },
  { name: "Olive", hex: "#4D7C0F" }, { name: "Amber", hex: "#92400E" },
  { name: "Orange", hex: "#C2410C" }, { name: "Burnt Orange", hex: "#9A3412" },
  { name: "Brown", hex: "#78350F" }, { name: "Warm Gray", hex: "#57534E" },
  { name: "Stone", hex: "#44403C" }, { name: "Slate", hex: "#475569" },
  { name: "Graphite", hex: "#374151" }, { name: "Steel", hex: "#334155" },
  { name: "Navy", hex: "#1E3A8A" }, { name: "Deep Teal", hex: "#134E4A" },
  { name: "Deep Green", hex: "#14532D" }, { name: "Deep Purple", hex: "#581C87" },
  { name: "Deep Rose", hex: "#881337" }, { name: "Caido Teal", hex: "#185A6C" },
];
