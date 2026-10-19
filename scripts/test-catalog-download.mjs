#!/usr/bin/env node

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { downloadCatalog } from "./catalog-download.mjs";

function requestDouble(responseFactory) {
  return (_url, _options, onResponse) => {
    const request = new EventEmitter();
    request.setTimeout = (_milliseconds, onTimeout) => queueMicrotask(onTimeout);
    request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
    if (responseFactory !== null) queueMicrotask(() => onResponse(responseFactory()));
    return request;
  };
}

test("aborts a hung download at the configured timeout", async () => {
  const controller = new AbortController();

  await assert.rejects(downloadCatalog({
    url: "https://raw.githubusercontent.com/haohuifeng0/awesome-jev/0000000000000000000000000000000000000000/catalog.json",
    timeoutMs: 7,
    signal: controller.signal,
    request: requestDouble(null),
  }), /timed out after 7ms/);
});

test("rejects redirects instead of following another host", async () => {
  const response = new EventEmitter();
  response.statusCode = 302;
  response.resume = () => {};

  await assert.rejects(downloadCatalog({
    url: "https://raw.githubusercontent.com/haohuifeng0/awesome-jev/0000000000000000000000000000000000000000/catalog.json",
    timeoutMs: 100,
    signal: new AbortController().signal,
    request: requestDouble(() => response),
  }), /HTTP 302; redirects are not allowed/);
});
