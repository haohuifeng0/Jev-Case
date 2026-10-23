const DEFAULT_SITE_URL = "https://haohuifeng0.github.io";
const DEFAULT_BASE_PATH = "/Jev-Case/";
const FEISHU_HOSTS = new Set([
  "feishu.cn",
  "forms.feishu.cn",
  "wenjuan.feishu.cn",
  "www.feishu.cn",
]);

export class DeploymentConfigError extends Error {
  name = "DeploymentConfigError";
}

function required(value, name, requireExplicit, fallback) {
  const candidate = value?.trim();
  if (candidate) return candidate;
  if (requireExplicit) throw new DeploymentConfigError(`${name} is required for a release dry run`);
  return fallback;
}

function parseSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DeploymentConfigError("PUBLIC_SITE_URL must be an absolute HTTPS origin");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new DeploymentConfigError("PUBLIC_SITE_URL must be an HTTPS origin without a path, query, credentials, or fragment");
  }
  if (url.hostname.endsWith(".github.io") && url.hostname !== "haohuifeng0.github.io") {
    throw new DeploymentConfigError("PUBLIC_SITE_URL has the wrong GitHub Pages owner; expected haohuifeng0.github.io");
  }
  return url.origin;
}

function parseBasePath(value) {
  if (!value.startsWith("/") || !value.endsWith("/") || value.includes("//")) {
    throw new DeploymentConfigError("PUBLIC_BASE_PATH must start and end with one slash");
  }
  const normalized = `/${value.split("/").filter(Boolean).join("/")}/`;
  return normalized === "//" ? "/" : normalized;
}

function parseFormUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DeploymentConfigError("PUBLIC_ASSESSMENT_FORM_URL must be an absolute HTTPS URL");
  }
  if (url.protocol !== "https:" || !FEISHU_HOSTS.has(url.hostname) || url.username || url.password || url.hash) {
    throw new DeploymentConfigError("PUBLIC_ASSESSMENT_FORM_URL must use an approved Feishu HTTPS host without credentials or a fragment");
  }
  return url.toString();
}

export function resolveDeploymentConfig(environment = process.env, requireExplicit = false) {
  const siteUrl = parseSiteUrl(required(environment.PUBLIC_SITE_URL, "PUBLIC_SITE_URL", requireExplicit, DEFAULT_SITE_URL));
  const basePath = parseBasePath(required(environment.PUBLIC_BASE_PATH, "PUBLIC_BASE_PATH", requireExplicit, DEFAULT_BASE_PATH));
  const formUrl = parseFormUrl(required(environment.PUBLIC_ASSESSMENT_FORM_URL, "PUBLIC_ASSESSMENT_FORM_URL", true, ""));
  const productionUrl = new URL(basePath, `${siteUrl}/`).toString();
  if (basePath !== "/" && productionUrl.includes(`${basePath}${basePath.slice(1)}`)) {
    throw new DeploymentConfigError("deployment URL contains the base path twice");
  }
  return Object.freeze({ siteUrl, basePath, formUrl, productionUrl });
}

export function assertCleanWorktree(status) {
  if (status.trim()) throw new DeploymentConfigError(`launch dry run requires a clean worktree; found:\n${status.trim()}`);
}
