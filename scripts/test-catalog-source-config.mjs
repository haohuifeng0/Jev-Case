#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import { catalogRawUrl, catalogRemote, catalogRepository } from "./catalog-source-config.mjs";

const commit = "e7aad0046c9013c6635a85a3a257f8508ecdb299";

test("configures the expected upstream repository remote and raw host", () => {
  assert.equal(catalogRepository, "https://github.com/haohuifeng0/awesome-jev");
  assert.equal(catalogRemote, "https://github.com/haohuifeng0/awesome-jev.git");
  assert.equal(
    catalogRawUrl(commit),
    `https://raw.githubusercontent.com/haohuifeng0/awesome-jev/${commit}/catalog.json`,
  );
});
