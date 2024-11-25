import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [vue()],
  server: {
    https: {
      key: fs.readFileSync("cert.key"),
      cert: fs.readFileSync("cert.crt"),
    },
    host: true,
    port: 5173,
  },
});
