import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const expectedSiteUrl = process.env.EXPECTED_SITE_URL ?? "https://haohuifeng0.github.io";
const expectedBasePath = `/${(process.env.EXPECTED_BASE_PATH ?? "/Jev-Case/").split("/").filter(Boolean).join("/")}`;
const expectedRoot = new URL(expectedBasePath === "/" ? "/" : `${expectedBasePath}/`, expectedSiteUrl).toString();

async function collectFiles(directory, suffix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target, suffix) : [target];
  }));
  return nested.flat().filter((file) => file.endsWith(suffix));
}

function extract(html, pattern) {
  return html.match(pattern)?.[1];
}

test("build emits complete, unique, production metadata", async () => {
  // Given: the complete production build.
  const htmlFiles = await collectFiles(distDirectory, ".html");
  assert.equal(htmlFiles.length, 888);

  // When: indexable metadata is collected.
  const records = await Promise.all(htmlFiles.map(async (file) => {
    const html = await readFile(file, "utf8");
    return {
      file,
      noindex: /<meta name="robots" content="[^"]*noindex/u.test(html),
      title: extract(html, /<title>([^<]+)<\/title>/u),
      canonical: extract(html, /<link rel="canonical" href="([^"]+)"/u),
    };
  }));
  const indexable = records.filter((record) => !record.noindex);

  // Then: every public route has one unique title and production canonical.
  assert.equal(records.every(({ canonical }) => canonical?.startsWith(expectedRoot)), true);
  assert.equal(indexable.length, 834);
  assert.equal(indexable.every(({ title }) => typeof title === "string" && title.length > 0), true);
  assert.equal(indexable.every(({ canonical }) => canonical?.startsWith(expectedRoot)), true);
  assert.equal(new Set(indexable.map(({ title }) => title)).size, indexable.length);
  assert.equal(new Set(indexable.map(({ canonical }) => canonical)).size, indexable.length);
});

test("sitemap contains every indexable route and no noindex route", async () => {
  // Given: the generated sitemap and HTML documents.
  const sitemap = await readFile(path.join(distDirectory, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  const htmlFiles = await collectFiles(distDirectory, ".html");
  const indexableCanonicals = (await Promise.all(htmlFiles.map(async (file) => {
    const html = await readFile(file, "utf8");
    if (/<meta name="robots" content="[^"]*noindex/u.test(html)) return undefined;
    return extract(html, /<link rel="canonical" href="([^"]+)"/u);
  }))).filter((canonical) => canonical !== undefined);

  // When: sitemap coverage is counted.
  // Then: home, cases, projects, scenarios, methodology, and service are covered only once.
  assert.equal(locations.length, 834);
  assert.equal(new Set(locations).size, locations.length);
  assert.deepEqual(new Set(indexableCanonicals), new Set(locations));
  assert.equal(locations.includes(expectedRoot), true);
  assert.equal(indexableCanonicals.includes(expectedRoot), true);
  assert.equal(locations.some((url) => url.includes("/case/")), true);
  assert.equal(locations.some((url) => url.includes("/projects/")), true);
  assert.equal(locations.some((url) => url.includes("/scenarios/")), true);
  assert.equal(locations.includes(`${expectedRoot}methodology`), true);
  assert.equal(locations.includes(`${expectedRoot}services/agent-decision-assessment`), true);
  assert.equal(locations.some((url) => url.endsWith("/404") || url.includes("2100619720772694036")), false);
});

test("all rendered internal links resolve and external blank targets are safe", async () => {
  // Given: every generated HTML document and public asset.
  const htmlFiles = await collectFiles(distDirectory, ".html");
  const builtFiles = await collectFiles(distDirectory, "");
  const available = new Set(builtFiles.map((file) => {
    const relative = path.relative(distDirectory, file).replaceAll(path.sep, "/");
    if (relative === "index.html") return "/";
    if (relative.endsWith("index.html")) return `/${relative.replace(/index\.html$/u, "")}`;
    return `/${relative.replace(/\.html$/u, "")}`;
  }));

  // When: rendered anchors and public asset links are inspected.
  const missing = [];
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/<(?:a|link)\b[^>]*\bhref="([^"]+)"[^>]*>/gu)) {
      const href = match[1];
      if (href.startsWith(`${expectedBasePath === "/" ? "" : expectedBasePath}/`)) {
        const pathname = new URL(href, "https://example.test").pathname.slice(expectedBasePath === "/" ? 0 : expectedBasePath.length) || "/";
        const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
        if (!available.has(pathname) && !available.has(normalized)) missing.push(`${file}: ${href}`);
      }
    }
    for (const tag of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gu)) {
      assert.match(tag[0], /rel="[^"]*noopener[^"]*noreferrer[^"]*"/u);
    }
  }

  // Then: no internal navigation points to an absent build artifact.
  assert.deepEqual(missing, []);
});

test("structured data stays truthful about third-party projects", async () => {
  // Given: representative project, directory, and service documents.
  const project = await readFile(path.join(distDirectory, "projects/romanslack-jev-drone/index.html"), "utf8");
  const projects = await readFile(path.join(distDirectory, "projects/index.html"), "utf8");
  const service = await readFile(path.join(distDirectory, "services/agent-decision-assessment/index.html"), "utf8");

  // When: their structured data is inspected.
  // Then: projects are pages/list entries, while only the owned offer is a Service.
  assert.doesNotMatch(project, /"@type":"SoftwareApplication"/u);
  assert.match(projects, /"@type":"ItemList"/u);
  assert.match(project, /"@type":"WebPage"/u);
  assert.match(service, /"@type":"Service"/u);
});
