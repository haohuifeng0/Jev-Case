import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalUrl, serializeJsonLd, withBasePath } from "../src/lib/metadata.ts";

test("serializes hostile JSON-LD without executable script terminators", () => {
  // Given: untrusted text contains script termination and JavaScript separators.
  const maliciousText = "</script><script>globalThis.pwned=true</script>\u2028\u2029";

  // When: the central JSON-LD serializer emits script text.
  const serialized = serializeJsonLd({ text: maliciousText });

  // Then: JSON semantics survive without raw HTML or JavaScript terminators.
  assert.equal(serialized.includes("<"), false);
  assert.equal(serialized.includes("\u2028"), false);
  assert.equal(serialized.includes("\u2029"), false);
  assert.deepEqual(JSON.parse(serialized), { text: maliciousText });
});

test("applies one normalized base path to internal and canonical URLs", () => {
  // Given: the production origin and GitHub Pages base contract.
  const siteUrl = "https://haohuifeng0.github.io";
  const basePath = "/Jev-Case/";

  // When: root and nested paths are resolved.
  // Then: the base appears exactly once and canonicals use production HTTPS.
  assert.equal(withBasePath("/", basePath), "/Jev-Case/");
  assert.equal(withBasePath("/projects/example", basePath), "/Jev-Case/projects/example");
  assert.equal(withBasePath("/Jev-Case/", basePath), "/Jev-Case/");
  assert.equal(withBasePath("/Jev-Case/404", basePath), "/Jev-Case/404");
  assert.equal(
    canonicalUrl("/projects/example", siteUrl, basePath),
    "https://haohuifeng0.github.io/Jev-Case/projects/example",
  );
  assert.equal(
    canonicalUrl("/Jev-Case/", siteUrl, basePath),
    "https://haohuifeng0.github.io/Jev-Case/",
  );
  assert.equal(
    canonicalUrl("/custom/projects", "https://example.com", "/custom"),
    "https://example.com/custom/projects",
  );
  assert.equal(canonicalUrl("/", "https://example.com", "/"), "https://example.com/");
});

test("keeps raw JSON.stringify out of every JSON-LD HTML seam", async () => {
  // Given: every source file capable of rendering structured data.
  const files = [
    new URL("../src/layouts/BaseLayout.astro", import.meta.url),
    new URL("../src/pages/case/[id].astro", import.meta.url),
  ];

  // When: their source is inspected.
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));

  // Then: no set:html expression directly calls JSON.stringify.
  for (const source of sources) {
    assert.doesNotMatch(source, /set:html=\{JSON\.stringify\(/u);
  }
});
