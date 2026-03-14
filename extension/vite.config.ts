import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// 빌드 타겟에 따라 설정 분기
// VITE_BUILD_TARGET 환경변수로 제어:
//   popup (기본) — HTML 엔트리, ESM OK
//   content      — IIFE 단일 파일, React 포함
//   worker       — IIFE 단일 파일, 순수 TS
const target = process.env.VITE_BUILD_TARGET ?? "popup";

function getConfig() {
  if (target === "content") {
    return defineConfig({
      plugins: [react()],
      root: resolve(__dirname, "src"),
      publicDir: false,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      build: {
        outDir: resolve(__dirname, "dist/content"),
        emptyOutDir: true,
        lib: {
          entry: resolve(__dirname, "src/content/index.tsx"),
          formats: ["iife"],
          name: "BscampExt",
          fileName: () => "index.js",
        },
        rollupOptions: {
          output: {
            // CSS를 별도 파일로 출력
            assetFileNames: "content.[ext]",
            // 모든 코드를 단일 파일에 인라인
            inlineDynamicImports: true,
          },
        },
        cssCodeSplit: false,
        minify: true,
      },
    });
  }

  if (target === "worker") {
    return defineConfig({
      root: resolve(__dirname, "src"),
      publicDir: false,
      build: {
        outDir: resolve(__dirname, "dist/background"),
        emptyOutDir: true,
        lib: {
          entry: resolve(__dirname, "src/background/service-worker.ts"),
          formats: ["iife"],
          name: "BscampWorker",
          fileName: () => "service-worker.js",
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
        minify: true,
      },
    });
  }

  // popup — 기본 HTML 엔트리 (ESM OK)
  return defineConfig({
    plugins: [react()],
    root: resolve(__dirname, "src"),
    publicDir: resolve(__dirname, "public"),
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "src/popup/index.html"),
        },
        output: {
          entryFileNames: "popup/popup.js",
          chunkFileNames: "popup/chunks/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "popup/popup.css";
            }
            return "popup/assets/[name][extname]";
          },
        },
      },
    },
  });
}

export default getConfig();
