import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@freshfold/ui": new URL(
        "../../packages/freshfold-ui/src/index.ts",
        import.meta.url,
      ).pathname,
      "@laundry/contracts": new URL(
        "../../packages/contracts/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "../../packages/freshfold-ui/src/**/*.test.{ts,tsx}",
    ],
    css: false,
    restoreMocks: true,
  },
});
