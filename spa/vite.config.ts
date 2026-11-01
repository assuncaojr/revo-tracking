import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Em desenvolvimento, /api vai para o núcleo local (mesma origem para o cookie da sessão).
// Em produção, o núcleo serve o build deste painel em / (T3).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
});
