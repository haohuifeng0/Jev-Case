import https from "node:https";

export class CatalogDownloadError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogDownloadError";
  }
}

export async function downloadCatalog({ url, timeoutMs, signal, request = https.get }) {
  return new Promise((resolve, reject) => {
    const handle = request(url, { headers: { "user-agent": "Jev-Case catalog importer" } }, (response) => {
      const chunks = [];
      if (response.statusCode !== 200) {
        response.resume();
        reject(new CatalogDownloadError(`download failed with HTTP ${response.statusCode}; redirects are not allowed`));
        return;
      }
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    const abort = () => handle.destroy(signal.reason instanceof Error ? signal.reason : new CatalogDownloadError("download interrupted"));
    signal.addEventListener("abort", abort, { once: true });
    handle.once("close", () => signal.removeEventListener("abort", abort));
    handle.on("error", reject);
    handle.setTimeout(timeoutMs, () => handle.destroy(new CatalogDownloadError(`download timed out after ${timeoutMs}ms`)));
    if (signal.aborted) abort();
  });
}
