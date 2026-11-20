/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./src/tests/testEnv.ts"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-pdf": ["pdf-lib"],
          "vendor-pdfjs": ["pdfjs-dist"],
          "vendor-zip": ["jszip"],
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
});
