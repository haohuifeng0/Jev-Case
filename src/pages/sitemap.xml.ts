import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { getCases } from "../lib/cases";
import { canonicalUrl } from "../lib/metadata";
import { projectData } from "../lib/project-data";

const staticPaths = [
  "/",
  "/projects",
  "/methodology",
  "/services/agent-decision-assessment",
] as const;

export const GET: APIRoute = async ({ site }) => {
  const siteUrl = site?.toString() ?? "https://haohuifeng0.github.io";
  const basePath = import.meta.env.BASE_URL;
  const scenarios = await getCollection("scenarios");
  const paths = [
    ...staticPaths,
    ...getCases().map((item) => `/case/${item.id}`),
    ...projectData.projects.projects.map((project) => `/projects/${project.slug}`),
    ...scenarios.map((scenario) => `/scenarios/${scenario.data.slug}`),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((pathname) => `<url><loc>${canonicalUrl(pathname, siteUrl, basePath)}</loc></url>`),
    "</urlset>",
  ].join("");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
