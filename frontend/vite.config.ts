import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev server proxies the API to the backend; ./dev.sh sets DEV_BACKEND_PORT if it isn't 8000.
const backendPort = process.env.DEV_BACKEND_PORT || "8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": `http://localhost:${backendPort}`,
      "/ws": { target: `ws://localhost:${backendPort}`, ws: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
