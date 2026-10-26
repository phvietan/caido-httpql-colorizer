import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { shared: fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTransformMode: { web: ["**/dialogs.test.ts"] },
    restoreMocks: true,
  },
});
