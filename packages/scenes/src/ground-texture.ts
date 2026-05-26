import type { GroundStyle } from "./scene-config";

interface GroundPainterContext {
  fillStyle: string | unknown;
  beginPath: () => void;
  arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void;
  fill: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
}

export function drawGround(
  ctx: GroundPainterContext,
  size: number,
  style: GroundStyle
): { u: number; v: number } {
  switch (style) {
    case "flat":
      drawFlat(ctx, size);
      return { u: 6, v: 8 };
    case "stripes":
      drawStripes(ctx, size);
      return { u: 2, v: 3 };
    case "checker":
      drawChecker(ctx, size);
      return { u: 8, v: 8 };
    case "painterly":
    default:
      drawPainterly(ctx, size);
      return { u: 6, v: 8 };
  }
}

function speckle(ctx: GroundPainterContext, size: number, n: number, tones: string[], w = 1.5, h = 2.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = tones[(Math.random() * tones.length) | 0];
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * w, 1 + Math.random() * h);
  }
}

function drawFlat(ctx: GroundPainterContext, size: number) {
  ctx.fillStyle = "#3c7a3a";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 3500, ["#357035", "#48913f", "#2f6630", "#54a049"]);
}

function drawPainterly(ctx: GroundPainterContext, size: number) {
  ctx.fillStyle = "#3a772f";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 4200, ["#2f6630", "#3f7d3c", "#4f9447", "#5aa850", "#357035", "#48913f"], 1.5, 3);
  const flowers = ["#f4e06a", "#ffffff", "#e88bbf", "#d96a6a"];
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = flowers[(Math.random() * flowers.length) | 0];
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStripes(ctx: GroundPainterContext, size: number) {
  const bands = 8;
  const h = size / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 ? "#3f7d3c" : "#367033";
    ctx.fillRect(0, i * h, size, h);
  }
  speckle(ctx, size, 2000, ["#347032", "#4a8a45"], 0.5, 1.5);
}

function drawChecker(ctx: GroundPainterContext, size: number) {
  const n = 6;
  const c = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#3f7d3c" : "#34692f";
      ctx.fillRect(i * c, j * c, c, c);
    }
  }
  speckle(ctx, size, 1500, ["rgba(255,255,255,0.05)", "rgba(0,0,0,0.05)"], 0.3, 0.3);
}
