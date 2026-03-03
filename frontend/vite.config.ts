import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_URL = process.env.API_URL || "http://localhost:5300";

export default defineConfig({
  plugins: [react(),tailwindcss()],
  base: process.env.NODE_ENV === "production" ? "/ecoimage/" : "/",
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api/dicom/info" :`${API_URL}`,
      "/api/roi/mean":`${API_URL}`,
      "/api/convert":`${API_URL}`,
    },
  },
});
