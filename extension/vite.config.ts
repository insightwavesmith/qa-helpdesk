import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // root를 src로 설정하면 index.html 경로가 dist/popup/index.html로 올바르게 출력됨
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        "service-worker": resolve(
          __dirname,
          "src/background/service-worker.ts",
        ),
        content: resolve(__dirname, "src/content/index.tsx"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "service-worker") {
            return "background/service-worker.js";
          }
          if (chunkInfo.name === "content") {
            return "content/index.js";
          }
          return "[name]/[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            if (assetInfo.name?.includes("content")) {
              return "content/content.css";
            }
            return "popup/[name][extname]";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
});
