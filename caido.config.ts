import { defineConfig } from "@caido-community/dev";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  id: "httpql-colorizer",
  name: "HTTPQL Colorizer",
  description:
    "Colorize Caido HTTP History rows with ordered HTTPQL rules, draggable groups, and per-rule or group enable/disable controls.",
  version: "1.0.6",
  author: {
    name: "phvietan",
    email: "phvietan@gmail.com",
    url: "https://github.com/phvietan/caido-httpql-colorizer",
  },
  plugins: [
    {
      kind: "backend",
      id: "httpql-colorizer-backend",
      name: "HTTPQL Colorizer Backend",
      root: "packages/backend",
    },
    {
      kind: "frontend",
      id: "httpql-colorizer-frontend",
      name: "HTTPQL Colorizer",
      root: "packages/frontend",
      backend: { id: "httpql-colorizer-backend" },
      vite: {
        plugins: [vue()],
        resolve: {
          alias: [
            {
              find: "@",
              replacement: path.resolve(__dirname, "packages/frontend/src"),
            },
          ],
        },
        build: {
          rollupOptions: {
            external: ["@caido/frontend-sdk"],
          },
        },
      },
    },
  ],
});
