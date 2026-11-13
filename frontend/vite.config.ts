import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

function fromRoot(relativePath: string): string {
  return decodeURIComponent(
    new URL(relativePath, import.meta.url).pathname,
  ).replace(/^\/([A-Za-z]:\/)/, "$1");
}

interface ProxyResponseLike {
  headersSent?: boolean;
  writeHead?(statusCode: number, headers: Record<string, string>): void;
  end?(body: string): void;
}

interface ProxyEmitterLike {
  on?(
    event: string,
    listener: (
      error: unknown,
      request: unknown,
      response: ProxyResponseLike,
    ) => void,
  ): void;
}

function gatewayProxy(target: string): ProxyOptions {
  return {
    target,
    configure(proxy) {
      (proxy as unknown as ProxyEmitterLike).on?.(
        "error",
        (_err, _req, res) => {
          if (!res.headersSent && res.writeHead && res.end) {
            res.writeHead(503, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "gateway_unreachable" }));
          }
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@freshfold/ui": fromRoot("./src/ui/index.ts"),
      "@laundry/contracts": fromRoot("../packages/contracts/src/index.ts"),
      "@": fromRoot("./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": gatewayProxy("http://127.0.0.1:8787"),
    },
  },
});

