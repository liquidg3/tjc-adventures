import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ASSET_MAP_FILE = resolve(here, "asset-map.json");
const VERTICAL_DEFAULTS_FILE = resolve(here, "vertical-defaults.json");

// Dev-only endpoint that persists Studio assignments to a committed JSON file
// (durable + version-controlled), instead of fragile browser localStorage.
//   GET  /__asset-map  → current asset-map.json
//   POST /__asset-map  → overwrite it with the request body
function assetMapPlugin(): Plugin {
  return {
    name: "tjc-asset-map",
    configureServer(server) {
      server.middlewares.use("/__asset-map", (req, res) => {
        if (req.method === "GET") {
          const data = existsSync(ASSET_MAP_FILE) ? readFileSync(ASSET_MAP_FILE, "utf8") : "{}";
          res.setHeader("content-type", "application/json");
          res.end(data);
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              writeFileSync(ASSET_MAP_FILE, body || "{}");
              res.end("ok");
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

function verticalDefaultsPlugin(): Plugin {
  return {
    name: "tjc-vertical-defaults",
    configureServer(server) {
      server.middlewares.use("/__vertical-defaults", (req, res) => {
        if (req.method === "GET") {
          const data = existsSync(VERTICAL_DEFAULTS_FILE)
            ? readFileSync(VERTICAL_DEFAULTS_FILE, "utf8")
            : "{}";
          res.setHeader("content-type", "application/json");
          res.end(data);
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              writeFileSync(VERTICAL_DEFAULTS_FILE, body || "{}");
              res.end("ok");
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), assetMapPlugin(), verticalDefaultsPlugin()],
  server: {
    host: true,
    port: 5174, // distinct from the game client (5173) so both can run
    strictPort: true,
    open: true,
  },
});
