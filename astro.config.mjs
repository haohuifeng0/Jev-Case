import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL ?? "https://haohuifeng0.github.io",
  base: process.env.PUBLIC_BASE_PATH ?? "/Jev-Case/",
  integrations: [react()],
});
