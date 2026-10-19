#!/usr/bin/env node

import net from "node:net";
import { spawn } from "node:child_process";

const host = process.env.SMOKE_HOST ?? "127.0.0.1";
const port = Number(process.env.SMOKE_PORT ?? "4321");

const occupied = await new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const finish = (isOccupied) => {
    socket.destroy();
    resolve(isOccupied);
  };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(1_000, () => finish(false));
});

if (occupied) {
  console.error(
    `Smoke tests cannot start: ${host}:${port} is already in use. `
    + `Stop the existing listener before running npm run test:smoke.`,
  );
  process.exitCode = 1;
} else {
  const playwright = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { stdio: "inherit", env: process.env },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => playwright.kill(signal));
  }

  playwright.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
