import type { PlayableRole } from "@tjc/core";

export const ROLE_LABELS: Record<PlayableRole, string> = {
  pilot: "Pilot",
  gunner: "Gunner",
  spotter: "Spotter",
};

export const ROLE_BLURBS: Record<PlayableRole, string> = {
  pilot: "Move the ship, dodge trouble, and hold the line.",
  gunner: "Aim the weapons, clear threats, and bring the boom.",
  spotter: "Tag targets, find rescues, and save the crew in a crisis.",
};

export const ROLE_STATION_COPY: Record<PlayableRole, string> = {
  pilot: "Hold buttons to fly the ship on the big screen.",
  gunner: "Weapons controls are next. For now, this seat is claimed.",
  spotter: "Tag and assist controls are next. For now, this seat is claimed.",
};
