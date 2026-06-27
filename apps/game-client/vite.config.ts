import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const studioRoot = resolve(repoRoot, "apps/studio");
const studioPublic = resolve(studioRoot, "public");

const jsonFiles: Record<string, string> = {
  "/__asset-map": resolve(studioRoot, "asset-map.json"),
  "/__asset-normalization-presets": resolve(studioRoot, "asset-normalization-presets.json"),
  "/__asset-normalization-overrides": resolve(studioRoot, "asset-normalization-overrides.json"),
  "/__vertical-defaults": resolve(studioRoot, "vertical-defaults.json"),
  "/__level-builder": resolve(studioRoot, "level-builder.json"),
  "/__model-catalog-overrides": resolve(studioRoot, "model-catalog-overrides.json"),
};

const contentTypes: Record<string, string> = {
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function studioDataPlugin(): Plugin {
  return {
    name: "tjc-game-client-studio-data",
    enforce: "pre",
    configureServer(server) {
      for (const [route, file] of Object.entries(jsonFiles)) {
        server.middlewares.use(route, (_req, res) => {
          res.setHeader("content-type", "application/json");
          res.end(existsSync(file) ? readFileSync(file, "utf8") : "{}");
        });
      }

      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        const root = url.startsWith("/models/")
          ? resolve(studioPublic, "models")
          : url.startsWith("/textures/")
            ? resolve(studioPublic, "textures")
            : null;
        if (!root) return next();

        const rel = url.replace(/^\/(models|textures)\//, "");
        const file = resolve(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();

        res.setHeader("content-type", contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [studioDataPlugin(), react()],
  server: {
    host: true, // expose on the LAN (0.0.0.0) so phones can reach it
    port: 5173,
    strictPort: true,
    open: true, // auto-open the default browser at the sandbox (/) on start
    fs: {
      allow: [repoRoot],
    },
  },
});
