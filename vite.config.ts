import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_", "SUPABASE_"],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.SUPABASE_PUBLIC_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
    )
  },
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
