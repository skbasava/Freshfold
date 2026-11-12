import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function fromRoot(relativePath: string): string {
  return decodeURIComponent(
    new URL(relativePath, import.meta.url).pathname,
  ).replace(/^\/([A-Za-z]:\/)/, "$1");
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@freshfold/ui": fromRoot("../../packages/freshfold-ui/src/index.ts"),
      "@laundry/contracts": fromRoot("../../packages/contracts/src/index.ts"),
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
