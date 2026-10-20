import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL ?? "https://hiwoniu.github.io",
  base: process.env.PUBLIC_BASE_PATH ?? "/Jev-Case",
  integrations: [react()],
});
