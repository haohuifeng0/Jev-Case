import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { ScenarioContentSchema } from "./lib/scenario-schema";

const scenarios = defineCollection({
  loader: glob({ base: "./src/content/scenarios", pattern: "**/*.json" }),
  schema: ScenarioContentSchema,
});

export const collections = { scenarios };
