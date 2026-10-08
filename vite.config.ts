import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5180 },
  // Ant Design makes the bundle large; for an internal tool used all day and
  // cached after the first visit that is fine. Heavy screens (rich text, PDF
  // preview) are lazy-loaded as they arrive.
  build: { chunkSizeWarningLimit: 1500 },
});
