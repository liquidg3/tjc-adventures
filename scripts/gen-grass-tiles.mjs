#!/usr/bin/env node
// Generate seamless 16-bit pixel-art grass tiles + a contact sheet for style review.
// Usage: node scripts/gen-grass-tiles.mjs
// Output: apps/studio/public/textures/grass/{<variant>.png, contact-sheet.png}
// Zero deps — encodes PNGs with Node's built-in zlib.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "apps/studio/public/textures/grass");

const TILE = 64;
const PREVIEW_SCALE = 4; // nearest-neighbor scale for the big preview in the contact sheet
const TILED_GRID = 4; // 4×4 tiled view at 1× to expose seams

// ────────────────────────────── PNG encoder ──────────────────────────────
const crcTable = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++)
		c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(W, H, rgba) {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(W, 0);
	ihdr.writeUInt32BE(H, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	const stride = W * 4;
	const raw = Buffer.alloc((stride + 1) * H);
	for (let y = 0; y < H; y++) {
		raw[y * (stride + 1)] = 0;
		raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}
	const idat = deflateSync(raw);
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// ────────────────────────────── seeded RNG ──────────────────────────────
function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ────────────────────────────── pixel utils ──────────────────────────────
function makeImg(W, H, [r, g, b, a] = [0, 0, 0, 255]) {
	const buf = new Uint8Array(W * H * 4);
	for (let i = 0; i < W * H; i++) {
		buf[i * 4] = r;
		buf[i * 4 + 1] = g;
		buf[i * 4 + 2] = b;
		buf[i * 4 + 3] = a;
	}
	return buf;
}

// Wraps coords so anything drawn near the edge bleeds to the opposite edge → seamless.
function px(img, W, H, x, y, [r, g, b], a = 255) {
	x = ((x % W) + W) % W;
	y = ((y % H) + H) % H;
	const i = (y * W + x) * 4;
	img[i] = r;
	img[i + 1] = g;
	img[i + 2] = b;
	img[i + 3] = a;
}

// Nearest-neighbor blit of a small tile into a larger sheet at integer scale.
function blit(dst, dW, sx, sy, src, sW, sH, scale = 1) {
	for (let y = 0; y < sH; y++) {
		for (let x = 0; x < sW; x++) {
			const si = (y * sW + x) * 4;
			const r = src[si],
				g = src[si + 1],
				b = src[si + 2],
				a = src[si + 3];
			for (let dy = 0; dy < scale; dy++) {
				for (let dx = 0; dx < scale; dx++) {
					const di =
						((sy + y * scale + dy) * dW + (sx + x * scale + dx)) * 4;
					dst[di] = r;
					dst[di + 1] = g;
					dst[di + 2] = b;
					dst[di + 3] = a;
				}
			}
		}
	}
}

function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}

function jitter(rand, [r, g, b], amt = 10) {
	const j = () => Math.round((rand() * 2 - 1) * amt);
	return [clamp(r + j(), 0, 255), clamp(g + j(), 0, 255), clamp(b + j(), 0, 255)];
}

// ────────────────────────────── palettes (16-bit / SNES-ish) ──────────────────────────────
const palettes = {
	classic: {
		bgDark: [58, 110, 50],
		bg: [82, 145, 64],
		bgLight: [105, 170, 80],
		blade: [124, 195, 95],
		bladeHi: [180, 230, 130],
		shadow: [38, 80, 38],
	},
	tufted: {
		bgDark: [42, 88, 38],
		bg: [62, 115, 50],
		bgLight: [85, 145, 65],
		blade: [115, 180, 80],
		bladeHi: [195, 230, 110],
		shadow: [28, 60, 28],
	},
	sparse: {
		dirt: [110, 78, 52],
		dirtDark: [78, 55, 38],
		bg: [70, 110, 48],
		bgLight: [95, 140, 65],
		blade: [125, 175, 75],
		bladeHi: [200, 225, 110],
		shadow: [45, 70, 35],
	},
};

// ────────────────────────────── base fills ──────────────────────────────
function fillBaseUniform(img, W, H, rand, pal) {
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const pick = rand();
			const base =
				pick < 0.15
					? jitter(rand, pal.bgDark, 8)
					: pick < 0.7
						? jitter(rand, pal.bg, 8)
						: jitter(rand, pal.bgLight, 10);
			px(img, W, H, x, y, base);
		}
	}
}

// Seamless dirt/grass blotches using sines whose periods divide the tile exactly.
function fillBaseDirt(img, W, H, rand, pal) {
	const a = (2 * Math.PI) / W;
	const b = (2 * Math.PI) / H;
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const n =
				(Math.sin(2 * x * a + 3 * y * b) +
					Math.sin(4 * x * a - y * b) +
					Math.cos(x * a + 2 * y * b)) /
				3;
			const noisy = n + (rand() * 0.4 - 0.2);
			let base;
			if (noisy > 0.25) base = jitter(rand, pal.dirt, 10);
			else if (noisy > 0.05) base = jitter(rand, pal.bgLight, 8);
			else base = jitter(rand, pal.bg, 8);
			px(img, W, H, x, y, base);
		}
	}
}

// ────────────────────────────── grass blades ──────────────────────────────
function drawBlade(img, W, H, x, y, height, color, hi, shadow) {
	// soft shadow at the base
	px(img, W, H, x, y + 1, shadow);
	for (let i = 0; i < height; i++) px(img, W, H, x, y - i, color);
	if (height >= 2) px(img, W, H, x, y - (height - 1), hi);
}

function genClassic(seed = 1337) {
	const rand = rng(seed);
	const pal = palettes.classic;
	const img = makeImg(TILE, TILE);
	fillBaseUniform(img, TILE, TILE, rand, pal);
	// dense, short, uniform blades
	for (let i = 0; i < 220; i++) {
		const x = Math.floor(rand() * TILE);
		const y = Math.floor(rand() * TILE);
		const h = 2 + Math.floor(rand() * 3);
		drawBlade(
			img,
			TILE,
			TILE,
			x,
			y,
			h,
			jitter(rand, pal.blade, 10),
			pal.bladeHi,
			pal.shadow,
		);
	}
	return img;
}

function genTufted(seed = 2024) {
	const rand = rng(seed);
	const pal = palettes.tufted;
	const img = makeImg(TILE, TILE);
	fillBaseUniform(img, TILE, TILE, rand, pal);
	// clumps of tall blades
	for (let c = 0; c < 22; c++) {
		const cx = Math.floor(rand() * TILE);
		const cy = Math.floor(rand() * TILE);
		const bladesInClump = 4 + Math.floor(rand() * 4);
		for (let b = 0; b < bladesInClump; b++) {
			const dx = Math.floor(rand() * 5) - 2;
			const dy = Math.floor(rand() * 3) - 1;
			const h = 4 + Math.floor(rand() * 4);
			drawBlade(
				img,
				TILE,
				TILE,
				cx + dx,
				cy + dy,
				h,
				jitter(rand, pal.blade, 12),
				pal.bladeHi,
				pal.shadow,
			);
		}
	}
	// scatter of short fill blades between clumps
	for (let i = 0; i < 40; i++) {
		const x = Math.floor(rand() * TILE);
		const y = Math.floor(rand() * TILE);
		drawBlade(
			img,
			TILE,
			TILE,
			x,
			y,
			2,
			jitter(rand, pal.blade, 8),
			pal.bladeHi,
			pal.shadow,
		);
	}
	return img;
}

function genSparse(seed = 7) {
	const rand = rng(seed);
	const pal = palettes.sparse;
	const img = makeImg(TILE, TILE);
	fillBaseDirt(img, TILE, TILE, rand, pal);
	for (let i = 0; i < 90; i++) {
		const x = Math.floor(rand() * TILE);
		const y = Math.floor(rand() * TILE);
		const h = 3 + Math.floor(rand() * 4);
		drawBlade(
			img,
			TILE,
			TILE,
			x,
			y,
			h,
			jitter(rand, pal.blade, 12),
			pal.bladeHi,
			pal.shadow,
		);
	}
	// dark dirt pebbles
	for (let i = 0; i < 15; i++) {
		const x = Math.floor(rand() * TILE);
		const y = Math.floor(rand() * TILE);
		px(img, TILE, TILE, x, y, jitter(rand, pal.dirtDark, 5));
	}
	return img;
}

// ────────────────────────────── contact sheet ──────────────────────────────
function buildContactSheet(tiles) {
	const PREVIEW = TILE * PREVIEW_SCALE; // 256
	const TILED = TILE * TILED_GRID; // 256
	const GUTTER = 16;
	const ROW_H = Math.max(PREVIEW, TILED);
	const W = GUTTER + PREVIEW + GUTTER + TILED + GUTTER;
	const H = GUTTER + (ROW_H + GUTTER) * tiles.length;
	const bg = [24, 28, 32, 255];
	const sheet = new Uint8Array(W * H * 4);
	for (let i = 0; i < W * H; i++) {
		sheet[i * 4] = bg[0];
		sheet[i * 4 + 1] = bg[1];
		sheet[i * 4 + 2] = bg[2];
		sheet[i * 4 + 3] = bg[3];
	}

	tiles.forEach((tile, r) => {
		const y = GUTTER + r * (ROW_H + GUTTER);
		// big preview, left
		blit(sheet, W, GUTTER, y, tile, TILE, TILE, PREVIEW_SCALE);
		// 4×4 tiled view at 1×, right
		const tiledX = GUTTER + PREVIEW + GUTTER;
		for (let ty = 0; ty < TILED_GRID; ty++) {
			for (let tx = 0; tx < TILED_GRID; tx++) {
				blit(sheet, W, tiledX + tx * TILE, y + ty * TILE, tile, TILE, TILE, 1);
			}
		}
	});
	return { W, H, sheet };
}

// ────────────────────────────── run ──────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const variants = [
	{ name: "meadow-classic", gen: genClassic },
	{ name: "meadow-tufted", gen: genTufted },
	{ name: "meadow-sparse", gen: genSparse },
];

const tiles = [];
for (const v of variants) {
	const tile = v.gen();
	tiles.push(tile);
	const path = resolve(OUT_DIR, `${v.name}.png`);
	writeFileSync(path, encodePNG(TILE, TILE, tile));
	console.log(`wrote ${path}`);
}

const sheet = buildContactSheet(tiles);
const sheetPath = resolve(OUT_DIR, "contact-sheet.png");
writeFileSync(sheetPath, encodePNG(sheet.W, sheet.H, sheet.sheet));
console.log(`wrote ${sheetPath}`);
console.log(
	`\nrow order (top → bottom): ${variants.map((v) => v.name).join(", ")}`,
);
