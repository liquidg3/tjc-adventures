import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the LAN (0.0.0.0) so phones can reach it
    port: 5173,
    strictPort: true,
    open: true, // auto-open the default browser at the sandbox (/) on start
  },
});
