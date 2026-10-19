#!/usr/bin/env node

import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const host = process.env.SMOKE_HOST ?? "127.0.0.1";
const port = Number(process.env.SMOKE_PORT ?? "4321");
const smokeEnvironment = {
  ...process.env,
  PUBLIC_ASSESSMENT_FORM_URL:
    process.env.PUBLIC_ASSESSMENT_FORM_URL
    ?? "https://wenjuan.feishu.cn/m/cfm?assessment_fixture=smoke",
};

function portIsOccupied() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

if (await portIsOccupied()) {
  console.error(
    `Smoke preview cannot start: ${host}:${port} is already in use. `
    + `Stop the existing server before running Playwright smoke tests.`,
  );
  process.exitCode = 1;
} else {
  const build = spawnSync("npm", ["run", "build"], {
    stdio: "inherit",
    env: smokeEnvironment,
  });
  if (build.error || build.status !== 0) {
    console.error("Smoke preview build failed; preview server was not started.");
    process.exitCode = build.status ?? 1;
  } else {
    const preview = spawn(
      process.execPath,
      [
        path.join("node_modules", "astro", "bin", "astro.mjs"),
        "preview",
        "--ignore-lock",
        "--host",
        host,
        "--port",
        String(port),
      ],
      {
        env: { ...smokeEnvironment, ASTRO_PREVIEW_BACKGROUND: "false" },
        stdio: "inherit",
      },
    );
    const originalParent = process.ppid;
    const parentMonitor = setInterval(() => {
      if (process.ppid !== originalParent) preview.kill("SIGTERM");
    }, 250);

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => preview.kill(signal));
    }

    preview.once("exit", (code, signal) => {
      clearInterval(parentMonitor);
      process.exitCode = code ?? (signal ? 1 : 0);
    });
  }
}
