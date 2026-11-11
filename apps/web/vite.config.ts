import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  optimizeDeps: {
    exclude: ["@freshfold/ui"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
    },
  },
});
