import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// In development, /api is proxied to the movies backend: MOVIES_API, a local one by default
// (MOVIES_API=https://movies.example.com npm run dev for another). In production nginx does the same.
const target = process.env.MOVIES_API ?? "http://localhost:8096";

// MOVIES_READONLY=1: answer writes (playback reports, watched/favorite toggles) locally, so
// trying the UI against the real server doesn't change its watch state.
const readonly: Plugin = {
  name: "readonly-api",
  configureServer(server) {
    if (!process.env.MOVIES_READONLY) return;
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith("/api/") && req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [readonly, react()],
  server: {
    proxy: {
      "/api": {
        target,
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
