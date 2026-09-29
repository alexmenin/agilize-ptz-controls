import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@\/assets\/(.*)$/,
        replacement: `${resolve(__dirname, "./assets")}/$1`,
      },
      {
        find: "@",
        replacement: resolve(__dirname, "./src"),
      },
    ],
  },
});
