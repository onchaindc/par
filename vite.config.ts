import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // Standalone ML-DSA-87 issuer signing page (no wallet needed).
        "pqc-signer": "pqc-signer.html",
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5173),
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173),
  },
});
