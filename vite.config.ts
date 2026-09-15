import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:4174"
    }
  },
  preview: {
    port: 5173
  }
});
