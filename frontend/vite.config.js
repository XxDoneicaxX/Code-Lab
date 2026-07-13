import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Cross-origin isolation (COOP/COEP) is required for SharedArrayBuffer, which
// powers a genuine blocking input() inside the Pyodide worker. jsdelivr (the
// Monaco/Pyodide CDN) sends Cross-Origin-Resource-Policy: cross-origin, so
// its assets still load fine under COEP: require-corp.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});
