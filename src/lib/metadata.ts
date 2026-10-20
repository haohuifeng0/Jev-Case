export type JsonLd = Readonly<Record<string, unknown>>;

export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function withBasePath(pathname: string, basePath: string): string {
  if (/^[a-z][a-z\d+.-]*:/iu.test(pathname)) return pathname;
  const normalizedBase = `/${basePath.split("/").filter(Boolean).join("/")}`;
  const suffixIndex = pathname.search(/[?#]/u);
  const path = suffixIndex === -1 ? pathname : pathname.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : pathname.slice(suffixIndex);
  const normalizedPath = `/${path.split("/").filter(Boolean).join("/")}`;
  if (normalizedBase === "/") return `${normalizedPath}${suffix}`;
  if (normalizedPath === normalizedBase) return `${normalizedBase}/${suffix}`;
  if (normalizedPath.startsWith(`${normalizedBase}/`)) return `${normalizedPath}${suffix}`;
  return `${normalizedBase}${normalizedPath}${suffix}`;
}

export function canonicalUrl(pathname: string, siteUrl: string, basePath: string): string {
  return new URL(withBasePath(pathname, basePath), new URL(siteUrl).origin).toString();
}
