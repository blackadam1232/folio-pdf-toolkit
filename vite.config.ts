import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
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
