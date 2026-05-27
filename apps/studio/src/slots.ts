import type { ShipVariant } from "./viewer-scene";

/** One assignable choice in a slot's dropdown — a built-in placeholder or a
 *  discovered model file. */
export interface AssetOption {
  value: string; // "" | "builtin:<variant>" | "model:<name>"
  label: string;
  variant?: ShipVariant;
  url?: string;
  atlas?: string;
}

export interface SlotDef {
  id: string;
  label: string;
}

export interface SlotCategory {
  category: string;
  slots: SlotDef[];
}

/** Every model the game needs (from the TJC Models checklist), grouped. Assign a
 *  downloaded model to each slot; empty slots show as "missing". */
export const SLOTS: SlotCategory[] = [
  {
    category: "Ships",
    slots: [
      { id: "ship-player", label: "Player ship (good guy)" },
      { id: "ship-enemy", label: "Enemy ship (bad guy)" },
    ],
  },
  {
    category: "Animals (rescue roster)",
    slots: [
      { id: "animal-sloth", label: "Sloth" },
      { id: "animal-bunny", label: "Bunny" },
      { id: "animal-fox", label: "Fox" },
      { id: "animal-cheetah", label: "Cheetah" },
    ],
  },
  {
    category: "Environment",
    slots: [
      { id: "env-trees", label: "Tree 1" },
      { id: "env-tree-2", label: "Tree 2" },
      { id: "env-grass", label: "Grass" },
      { id: "env-bushes", label: "Bushes" },
      { id: "env-rocks", label: "Rocks" },
    ],
  },
  {
    category: "Terrain (meadow variations)",
    slots: [
      { id: "terrain-a", label: "Meadow terrain A" },
      { id: "terrain-b", label: "Meadow terrain B" },
      { id: "terrain-c", label: "Meadow terrain C" },
    ],
  },
  {
    category: "Props",
    slots: [
      { id: "prop-cage", label: "Cage" },
      { id: "prop-box", label: "Box" },
      { id: "prop-fruit", label: "Fruit 1" },
      { id: "prop-fruit-2", label: "Fruit 2" },
      { id: "prop-fruit-3", label: "Fruit 3" },
      { id: "prop-berries", label: "Berries" },
    ],
  },
];
