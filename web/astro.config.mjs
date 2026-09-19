import { defineConfig } from "astro/config";

// Static output -> dist/, served by the web Worker assets (KISS: no SSR).
export default defineConfig({
  output: "static",
  outDir: "dist",
});
