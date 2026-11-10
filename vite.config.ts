import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { ProxyOptions } from "vite";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from "path";

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname;

// Dev-only OCR relay. OpenCode's chat endpoint sends no CORS headers, so a
// browser cannot call it directly; this forwards /api/opencode/* to the Go
// gateway and injects the API key server-side (from the shell or .env.local) so
// no key has to sit in localStorage during development. The deployed equivalent
// is relay/opencode-ocr-worker.js — the client code is identical for both.
const fileEnv = loadEnv(process.env.NODE_ENV ?? "development", projectRoot, "");
const openCodeApiKey = process.env.OPENCODE_GO_API_KEY || fileEnv.OPENCODE_GO_API_KEY || "";

const openCodeRelay: ProxyOptions = {
  target: "https://opencode.ai/zen/go/v1",
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/opencode/, ""),
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => {
      if (openCodeApiKey && !proxyReq.getHeader("authorization")) {
        proxyReq.setHeader("authorization", `Bearer ${openCodeApiKey}`);
      }
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/opencode": openCodeRelay,
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin({ port: 5173 }) as PluginOption,
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      includeAssets: ["apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,txt,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages-cache",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ request }) =>
              ["style", "script", "worker"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "assets-cache",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // Add COOP/COEP headers required for SharedArrayBuffer (WASM multithreading)
    {
      name: "coop-coep-headers",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": resolve(projectRoot, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Radix UI — large but stable between releases
          if (id.includes("@radix-ui")) {
            return "radix-ui";
          }
          // Animation library
          if (id.includes("framer-motion")) {
            return "framer-motion";
          }
          // Core React runtime
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/")
          ) {
            return "react-core";
          }
        },
      },
    },
  },
});
