#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { getSafeRequestTarget } from "./request-target-guard.mjs";

const host = readFlag("--host") ?? "127.0.0.1";
const port = Number(readFlag("--port") ?? "4321");
const upstreamHost = "127.0.0.1";
const upstreamPort = port + 1;

if (!Number.isInteger(port) || port < 1 || port > 65_534) {
  throw new RangeError("preview port must be an integer between 1 and 65534");
}
if (await portIsOccupied(host, port) || await portIsOccupied(upstreamHost, upstreamPort)) {
  throw new Error(`preview ports ${port} and ${upstreamPort} must both be available`);
}

const upstream = spawn(
  process.execPath,
  [
    path.join("node_modules", "astro", "bin", "astro.mjs"),
    "preview",
    "--ignore-lock",
    "--host",
    upstreamHost,
    "--port",
    String(upstreamPort),
  ],
  { env: process.env, stdio: "inherit" },
);

if (!(await waitForPort(upstreamHost, upstreamPort, 30_000))) {
  upstream.kill("SIGTERM");
  throw new Error(`Astro preview did not open ${upstreamHost}:${upstreamPort}`);
}

const notFound = await readFile(new URL("../dist/404.html", import.meta.url));
const server = http.createServer((request, response) => {
  const rawUrl = request.url ?? "/";
  const upstreamTarget = getSafeRequestTarget(rawUrl);
  if (upstreamTarget === undefined) {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Length": notFound.byteLength,
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(notFound);
    return;
  }

  const proxy = http.request({
    host: upstreamHost,
    port: upstreamPort,
    method: request.method,
    path: upstreamTarget,
    headers: { ...request.headers, host: `${upstreamHost}:${upstreamPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  proxy.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview upstream unavailable");
  });
  request.pipe(proxy);
});

server.listen(port, host);
await once(server, "listening");
console.log(`Guarded preview listening on http://${host}:${port}`);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  server.close();
  upstream.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}
upstream.once("exit", (code, signal) => {
  if (!stopping) {
    server.close();
    process.exitCode = code ?? (signal ? 1 : 0);
  }
});

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function portIsOccupied(targetHost, targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: targetHost, port: targetPort });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function waitForPort(targetHost, targetPort, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await portIsOccupied(targetHost, targetPort)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
