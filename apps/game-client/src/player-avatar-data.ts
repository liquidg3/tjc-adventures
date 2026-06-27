import type { AvatarId } from "@tjc/core";

export interface AvatarDef {
  id: AvatarId;
  name: string;
  blurb: string;
  palette: Record<string, string>;
  pixels: string[];
}

export const PLAYER_AVATARS: AvatarDef[] = [
  {
    id: "comet-cadet",
    name: "Comet Cadet",
    blurb: "Blue suit, bright visor, ready to launch.",
    palette: {
      d: "#111629",
      b: "#2f6df6",
      l: "#75c7ff",
      v: "#dff7ff",
      s: "#ffd45a",
    },
    pixels: [
      "............",
      "....dddd....",
      "...dvvvvd...",
      "..dvvvvvvd..",
      "..dlllllld..",
      ".dbbbbbbbd..",
      ".dbbsbsbbd..",
      "..dbbbbbd...",
      "...dssssd...",
      "...dbbbd....",
      "..dd...dd...",
      "............",
    ],
  },
  {
    id: "circuit-champ",
    name: "Circuit Champ",
    blurb: "Goggles, headset, gadget genius.",
    palette: {
      d: "#10231f",
      g: "#35d07f",
      c: "#1d7f68",
      v: "#b8fff0",
      y: "#fff06a",
    },
    pixels: [
      "............",
      "...gggggg...",
      "..gddddddg..",
      ".gddvvvvddg.",
      ".gdyvvvvydg.",
      "..gdccccdg..",
      "..gccccccg..",
      "...gccycg...",
      "..ddggggdd..",
      "..dccggccd..",
      "...d....d...",
      "............",
    ],
  },
  {
    id: "nova-knight",
    name: "Nova Knight",
    blurb: "Purple armor hoodie, dramatic hero stance.",
    palette: {
      d: "#17102a",
      p: "#7c4dff",
      m: "#b47cff",
      v: "#ecdcff",
      r: "#ff6aa8",
    },
    pixels: [
      "............",
      "....dddd....",
      "...dmmmmd...",
      "..dmvvvvmd..",
      "..dvvvvvvd..",
      ".dppppppppd.",
      ".dppmrrmppd.",
      "..dppppppd..",
      "..ddmppmdd..",
      ".dppddddppd.",
      ".d..d..d..d.",
      "............",
    ],
  },
  {
    id: "signal-sprite",
    name: "Signal Sprite",
    blurb: "Orange scout suit, quick grin, good radar.",
    palette: {
      d: "#24170c",
      o: "#ff9f2f",
      y: "#ffd95a",
      v: "#fff3c4",
      a: "#7de6ff",
    },
    pixels: [
      "............",
      ".....dd.....",
      "...dyyyyd...",
      "..dyvvvyd...",
      ".dyvvvvvyd..",
      ".doyyyyood..",
      ".dooyayoood.",
      "..doooood...",
      "...dyyyd....",
      "..ddooodd...",
      "..d.....d...",
      "............",
    ],
  },
];

export function avatarById(id: string | undefined) {
  return PLAYER_AVATARS.find((avatar) => avatar.id === id) ?? PLAYER_AVATARS[0];
}
