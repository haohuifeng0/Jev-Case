import net from "node:net";
import { expect, test } from "@playwright/test";

const rejectedTargets = [
  "/projects/%3Cscript%3Eignore%3C%2Fscript%3E",
  "/projects/%2e%2e%2fsecret",
  "/projects/%FF",
  "/projects/foo%2Fbar",
  "/projects/foo%5Cbar",
  "//projects/%FF",
  "/PROJECTS/%FF",
  "http://127.0.0.1:4321/projects/%FF",
  "/case/%",
  "/case/%GG",
  "/case/%FF",
  "/case/foo%2Fbar",
  "/case/foo%5Cbar",
  "/case/%2e%2e/secret",
  "/case/%3Cscript%3Ealert%3C/script%3E",
];

function sendRawRequest(target) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 4321 });
    let response = "";
    socket.setEncoding("utf8");
    socket.setTimeout(5_000, () => socket.destroy(new Error("raw request timed out")));
    socket.once("connect", () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:4321\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.once("error", reject);
    socket.once("end", () => {
      const status = Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1]);
      resolve({ status, response });
    });
  });
}

for (const target of rejectedTargets) {
  test(`rejects malformed raw request target ${target}`, async () => {
    // Given: an unnormalized request target reaches the preview socket.
    // When: the exact request line is sent without browser URL normalization.
    const result = await sendRawRequest(target);

    // Then: the generated inert 404 is returned without implementation details.
    expect(result.status).toBe(404);
    expect(result.response).toContain('name="robots" content="noindex, nofollow"');
    expect(result.response).toContain("这条信号不存在。");
    expect(result.response).not.toMatch(/ERR_|URIError|TypeError|fileURLToPath|<pre>/);
  });
}

test("preserves a legitimate query string on a normal route", async () => {
  // Given: a valid project index path with encoded query content.
  // When: the exact request line is sent through the preview guard.
  const result = await sendRawRequest("/projects?agent=multi&q=%3Cscript%3E");

  // Then: the route remains available and is not mistaken for a malformed path.
  expect(result.status).toBe(200);
  expect(result.response).toContain("Jev 项目目录");
});
