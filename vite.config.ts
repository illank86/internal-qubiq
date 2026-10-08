import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5180 },
  // One bundle (~180 kB gzipped) is fine for an internal tool used all day;
  // heavy screens (rich text, PDF preview) will be lazy-loaded as they arrive.
  build: { chunkSizeWarningLimit: 800 },
});
